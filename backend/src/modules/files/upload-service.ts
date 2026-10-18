import { createHmac, randomUUID } from 'node:crypto'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { authenticateTransaction } from '../auth/index.ts'
import type { AuthConfig } from '../auth/index.ts'
import { consumeDurableLimit } from '../../shared/database/durable-rate-limit.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import type { createPrivateObjectStore } from './private-object-store.ts'
import type { InspectedUpload } from './upload-policy.ts'
import { MAX_UPLOAD_BYTES } from './upload-policy.ts'
import { fileAssetDto } from './file-mapper.ts'
import { createUploadRepository, releaseUploadLease } from './upload-repository.ts'

export type UploadDependencies = {
  store: Pick<ReturnType<typeof createPrivateObjectStore>, 'put' | 'read'>
  scanner: { scan(bytes: Buffer): Promise<'clean' | 'rejected'> }
}
type UploadIdentity = { accessToken: string; key: string; requestId: string; origin?: string; csrfGuard?: string }
type UploadInput = { bytes: Buffer; metadata: InspectedUpload; driverId?: string }
export function createUploadService(client: PrismaClient, auth: AuthConfig, fingerprintKey: Uint8Array, origins: string[], dependencies: UploadDependencies, attemptsPerMinute = 12) {
  if (fingerprintKey.length !== 32 || Buffer.from(fingerprintKey).equals(auth.key)) throw new Error('Invalid command configuration. Upload fingerprints require an independent 32-byte key.')
  if (!Number.isInteger(attemptsPerMinute) || attemptsPerMinute < 1 || attemptsPerMinute > 100) throw new Error('Invalid upload admission limit.')
  const key = Uint8Array.from(fingerprintKey)
  function transaction<T>(run: (context: WorkflowTransaction) => Promise<T>) {
    return client.$transaction((transaction) => withWorkflowTransaction(transaction, run), { isolationLevel: 'ReadCommitted', maxWait: 2000, timeout: 5000 })
  }
  async function authorize(context: WorkflowTransaction, identity: Pick<UploadIdentity, 'accessToken' | 'origin' | 'csrfGuard'>) {
    const actor = await authenticateTransaction(context, identity.accessToken, auth, ['admin', 'driver'])
    if (actor.transport === 'browser' && (!origins.includes(identity.origin ?? '') || identity.csrfGuard !== '1')) throw new HttpError(403, 'FORBIDDEN', 'Browser origin or CSRF protection is invalid.')
    return actor
  }
  async function target(context: WorkflowTransaction, actor: Awaited<ReturnType<typeof authorize>>, driverId?: string) {
    if (actor.role === 'driver' && driverId !== undefined) throw new HttpError(422, 'VALIDATION_FAILED', 'Driver upload context is derived from the current account.')
    const id = actor.role === 'driver' ? actor.driverId : driverId
    if (!id) throw new HttpError(422, 'VALIDATION_FAILED', 'An administrator must specify the target driver.')
    const driver = await createUploadRepository(context).driver(id)
    if (!driver) throw new HttpError(404, 'NOT_FOUND', 'Driver not found.')
    if (actor.role === 'driver' && !['Pending', 'Active'].includes(driver.status)) throw new HttpError(403, 'FORBIDDEN', 'This driver profile cannot upload onboarding documents.')
    return driver.id
  }
  function outcome(asset: Parameters<typeof fileAssetDto>[0]) {
    if (asset.malwareScanStatus === 'rejected') throw new HttpError(422, 'FILE_REJECTED', 'The uploaded file was rejected by malware scanning.')
    if (asset.malwareScanStatus !== 'clean') throw new HttpError(503, 'UPLOAD_PENDING', 'Retry the same upload intent to finish scanning.', 1)
    return fileAssetDto(asset)
  }
  return {
    // Authenticate before reading multipart bytes. Repeat inside each write phase.
    async preflight(identity: Pick<UploadIdentity, 'accessToken' | 'origin' | 'csrfGuard'>) {
      const actor = await transaction((context) => authorize(context, identity))
      await consumeDurableLimit(client, `file-upload:${actor.userId}`, attemptsPerMinute, 60, auth.key)
    },
    async upload(identity: UploadIdentity, input: UploadInput) {
      const leaseToken = randomUUID()
      const reserved = await transaction(async (context) => {
        const actor = await authorize(context, identity); const driverId = await target(context, actor, input.driverId)
        const repository = createUploadRepository(context)
        const fingerprint = createHmac('sha256', key).update(JSON.stringify({ purpose: 'driver_document', driverId, ...input.metadata })).digest('hex')
        if (!await repository.lock(actor.userId, identity.key)) throw new HttpError(409, 'COMMAND_IN_PROGRESS', 'The upload intent is being claimed. Retry the same key and file.', 1)
        const found = await repository.find(actor.userId, identity.key)
        const previous = found ? await repository.findLocked(found.assetId) : null
        const now = await repository.now()
        if (previous) {
          if (previous.requestFingerprint !== fingerprint) throw new HttpError(409, 'IDEMPOTENCY_KEY_REUSED', 'This upload key was already used with different input.')
          if (previous.completedAt) return { asset: previous.asset, isComplete: true }
          if (previous.leaseExpiresAt && previous.leaseExpiresAt > now) throw new HttpError(409, 'COMMAND_IN_PROGRESS', 'The upload is still running. Retry the same key and file.', 1)
          await repository.claim(previous.assetId, leaseToken, now)
          return { asset: previous.asset, isComplete: false }
        }
        const asset = await repository.reserve(actor.userId, driverId, identity.key, fingerprint, input.metadata, leaseToken, now)
        await repository.audit(actor.userId, asset.id, identity.requestId, 'file.upload_reserved', 'pending', now)
        return { asset, isComplete: false }
      })
      if (reserved.isComplete) return outcome(reserved.asset)
      try {
        try { await dependencies.store.put(reserved.asset.id, input.bytes, MAX_UPLOAD_BYTES) }
        catch (error) {
          if (!(error instanceof HttpError) || error.code !== 'STORAGE_OBJECT_EXISTS') throw error
          // A PUT may have succeeded before response loss or process death. The
          // immutable object must match this exact intent before scanning resumes.
          await dependencies.store.read(reserved.asset.id, MAX_UPLOAD_BYTES, input.metadata.checksumSha256)
        }
        const status = await dependencies.scanner.scan(input.bytes)
        const asset = await transaction(async (context) => {
          const actor = await authorize(context, identity); await target(context, actor, input.driverId)
          const repository = createUploadRepository(context); const intent = await repository.findLocked(reserved.asset.id); const now = await repository.now()
          if (intent.completedAt) return intent.asset
          if (intent.leaseToken !== leaseToken || !intent.leaseExpiresAt || intent.leaseExpiresAt <= now) throw new HttpError(409, 'COMMAND_IN_PROGRESS', 'The upload claim expired. Retry the same key and file.', 1)
          const asset = await repository.complete(intent.assetId, status, now)
          await repository.audit(actor.userId, asset.id, identity.requestId, 'file.scan_completed', status, now)
          return asset
        })
        return outcome(asset)
      } finally {
        // Best effort only: process death/DB outage is recovered after the durable
        // lease expires. Never delete a possibly committed object on uncertainty.
        await releaseUploadLease(client, reserved.asset.id, leaseToken).catch(() => {})
      }
    },
  }
}
export type UploadService = ReturnType<typeof createUploadService>
