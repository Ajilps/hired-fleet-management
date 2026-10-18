import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import type { InspectedUpload } from './upload-policy.ts'

export function createUploadRepository(transaction: WorkflowTransaction) {
  return {
    async lock(actorId: string, key: string) {
      const lockId = BigInt.asIntN(64, BigInt(`0x${createHash('sha256').update(JSON.stringify(['file-upload', actorId, key])).digest('hex').slice(0, 16)}`))
      const rows = await transaction.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(${lockId}::bigint) AS acquired`
      return rows[0]!.acquired
    },
    async now() { return (await transaction.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0]!.now },
    async driver(id: string) {
      await transaction.$queryRaw`SELECT id FROM drivers WHERE id = ${id}::uuid FOR SHARE`
      return transaction.driver.findUnique({ where: { id } })
    },
    find(actorUserId: string, idempotencyKey: string) {
      return transaction.fileUploadIntent.findUnique({ where: { actorUserId_idempotencyKey: { actorUserId, idempotencyKey } }, include: { asset: true } })
    },
    async findLocked(assetId: string) {
      await transaction.$queryRaw`SELECT asset_id FROM file_upload_intents WHERE asset_id = ${assetId}::uuid FOR UPDATE`
      return transaction.fileUploadIntent.findUniqueOrThrow({ where: { assetId }, include: { asset: true } })
    },
    async reserve(actorId: string, driverId: string, key: string, fingerprint: string, metadata: InspectedUpload, leaseToken: string, now: Date) {
      const assetId = randomUUID()
      const asset = await transaction.fileAsset.create({ data: { id: assetId, storageKey: `quarantine/${assetId}`, originalFilename: metadata.originalFilename, mimeType: metadata.mimeType, byteSize: metadata.sizeBytes, checksumSha256: metadata.checksumSha256, purpose: 'driver_document', driverId, uploadedByUserId: actorId, createdAt: now } })
      await transaction.fileUploadIntent.create({ data: { assetId, actorUserId: actorId, idempotencyKey: key, requestFingerprint: fingerprint, leaseToken, leaseExpiresAt: new Date(now.getTime() + 60_000), createdAt: now } })
      return asset
    },
    claim(assetId: string, leaseToken: string, now: Date) {
      return transaction.fileUploadIntent.update({ where: { assetId }, data: { leaseToken, leaseExpiresAt: new Date(now.getTime() + 60_000) } })
    },
    async complete(assetId: string, status: 'clean' | 'rejected', now: Date) {
      const asset = await transaction.fileAsset.update({ where: { id: assetId }, data: { malwareScanStatus: status } })
      await transaction.fileUploadIntent.update({ where: { assetId }, data: { completedAt: now, leaseToken: null, leaseExpiresAt: null } })
      return asset
    },
    audit(actorUserId: string, assetId: string, requestId: string, action: string, scanStatus: string, now: Date) {
      return transaction.auditLog.create({ data: { actorUserId, entityType: 'file_asset', entityId: assetId, action, requestId, afterData: { id: assetId, purpose: 'driver_document', scanStatus }, createdAt: now } })
    },
  }
}

export function releaseUploadLease(client: PrismaClient, assetId: string, leaseToken: string) {
  return client.fileUploadIntent.updateMany({ where: { assetId, leaseToken, completedAt: null }, data: { leaseToken: null, leaseExpiresAt: null } })
}
