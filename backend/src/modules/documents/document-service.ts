import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import { authenticateTransaction } from '../auth/index.ts'
import type { AuthConfig } from '../auth/index.ts'
import { createCommandExecutor } from '../commands/index.ts'
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import { createDocumentRepository } from './document-repository.ts'
import { createDocumentCursor } from './document-cursor.ts'
import { documentDto, documentSelect, documentTypeMap } from './document-mapper.ts'
import type { AttachDocumentInput, ListDocumentsInput } from './document-validator.ts'
import type { DocumentCipher } from './document-crypto.ts'

type Identity = { accessToken: string; key: string; requestId: string; origin?: string; csrfGuard?: string }
export function createDocumentService(client: PrismaClient, auth: AuthConfig, fingerprintKey: Uint8Array, origins: string[], cipher?: DocumentCipher) {
  const execute = createCommandExecutor(client, { auth, fingerprintKey, allowedRoles: ['driver'], lockOwnDriver: true })
  const cursor = createDocumentCursor(fingerprintKey)
  return {
    list(token: string, input: ListDocumentsInput, requestedDriverId?: string) {
      return client.$transaction(transaction => withWorkflowTransaction(transaction, async context => {
        const actor = await authenticateTransaction(context, token, auth, requestedDriverId ? ['admin'] : ['driver'])
        const driverId = requestedDriverId ?? actor.driverId!
        const repository = createDocumentRepository(context); await repository.driver(driverId)
        const scope = `documents:${actor.userId}:${driverId}:${input.isCurrent ?? 'all'}:uploaded-desc`
        const result = await repository.list(driverId, input, cursor.decode(scope, input.cursor))
        const hasMore = result.items.length > input.limit; const items = result.items.slice(0, input.limit)
        return { items: items.map(item => documentDto(item.document)), pageInfo: { totalCount: result.totalCount, hasMore, nextCursor: hasMore ? cursor.encode(scope, items.at(-1)!.position) : null } }
      }), { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 })
    },
    async attach(identity: Identity, input: AttachDocumentInput) {
      try {
        return await execute({ ...identity, method: 'POST', canonicalPath: '/api/v1/drivers/me/documents', request: input,
          async authorize(_context, actor) {
            if (actor.transport === 'browser' && (!origins.includes(identity.origin ?? '') || identity.csrfGuard !== '1')) throw new HttpError(403, 'FORBIDDEN', 'Browser origin or CSRF protection is invalid.')
          },
          async execute(context, actor) {
            const driverId = actor.driverId!
            const driver = await createDocumentRepository(context).driver(driverId, true)
            if (!['Pending', 'Active'].includes(driver.status)) throw new HttpError(403, 'FORBIDDEN', 'This profile cannot attach onboarding documents.')
            await context.$queryRaw`SELECT id FROM file_assets WHERE id = ${input.fileAssetId}::uuid FOR SHARE`
            const asset = await context.fileAsset.findFirst({ where: { id: input.fileAssetId, uploadedByUserId: actor.userId, driverId, purpose: 'driver_document' } })
            if (!asset) throw new HttpError(404, 'NOT_FOUND', 'File asset not found.')
            if (asset.malwareScanStatus !== 'clean') throw new HttpError(409, 'FILE_NOT_CLEAN', 'A clean scan is required before attachment.')
            const documentType = documentTypeMap[input.documentType]
            if (await context.driverDocument.findFirst({ where: { OR: [{ driverId, documentType, isCurrent: true }, { fileAssetId: asset.id }] } })) throw new HttpError(409, 'DOCUMENT_ALREADY_ATTACHED', 'This document type or file is already attached.')
            const id = randomUUID()
            if (input.documentNumber !== undefined && !cipher) throw new HttpError(503, 'DOCUMENT_KEY_UNAVAILABLE', 'Document-number encryption is not configured.')
            const encrypted = input.documentNumber === undefined ? {} : cipher!.encrypt(input.documentNumber, { id, driverId, fileAssetId: asset.id, documentType: input.documentType })
            const row = await context.driverDocument.create({ data: { id, driverId, fileAssetId: asset.id, documentType, ...encrypted, expiresOn: input.expiresOn ? new Date(`${input.expiresOn}T00:00:00Z`) : null, uploadedAt: new Date() }, select: documentSelect })
            return { outcome: 'succeeded', response: { status: 201, body: documentDto(row) }, audit: [{ entityType: 'driver_document', entityId: id, action: 'driver_document.attached', after: { id, driverId, fileAssetId: asset.id, documentType: input.documentType } }] }
          },
        })
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new HttpError(409, 'DOCUMENT_ALREADY_ATTACHED', 'This document type or file is already attached.')
        throw error
      }
    },
  }
}
