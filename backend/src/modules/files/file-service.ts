import type { PrismaClient } from '../../generated/prisma/client.ts'
import { authenticateTransaction } from '../auth/index.ts'
import type { AuthConfig } from '../auth/index.ts'
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import { createFileRepository } from './file-repository.ts'
import { fileAssetDto } from './file-mapper.ts'
import { consumeDurableLimit } from '../../shared/database/durable-rate-limit.ts'
import type { createPrivateObjectStore } from './private-object-store.ts'

export type FileAccessConfig = { fingerprintKey: Uint8Array; origins: string[]; signer?: Pick<ReturnType<typeof createPrivateObjectStore>, 'signDownload'> }
type DownloadIdentity = { accessToken: string; requestId: string; origin?: string; csrfGuard?: string }

export function createFileService(client: PrismaClient, auth: AuthConfig, access?: FileAccessConfig) {
  return {
    get(accessToken: string, id: string) {
      return client.$transaction((transaction) => withWorkflowTransaction(transaction, async (context) => {
        const actor = await authenticateTransaction(context, accessToken, auth, ['admin', 'partner', 'driver'])
        const asset = await createFileRepository(context).findAccessible(id, actor.userId, actor.role, actor.driverId)
        if (!asset) throw new HttpError(404, 'NOT_FOUND', 'File asset not found.')
        return fileAssetDto(asset)
      }), { isolationLevel: 'ReadCommitted', maxWait: 2000, timeout: 5000 })
    },
    async download(identity: DownloadIdentity, id: string) {
      const principal = await client.$transaction(transaction => withWorkflowTransaction(transaction, context => authenticateTransaction(context, identity.accessToken, auth, ['admin', 'partner', 'driver'])))
      if (principal.transport === 'browser' && (!access?.origins.includes(identity.origin ?? '') || identity.csrfGuard !== '1')) throw new HttpError(403, 'FORBIDDEN', 'Browser origin or CSRF protection is invalid.')
      if (access) await consumeDurableLimit(client, `download:${principal.userId}`, 60, 60, access.fingerprintKey)
      return client.$transaction(transaction => withWorkflowTransaction(transaction, async context => {
        const actor = await authenticateTransaction(context, identity.accessToken, auth, ['admin', 'partner', 'driver'])
        const asset = await createFileRepository(context).findAttached(id, actor.role, actor.driverId)
        if (!asset) throw new HttpError(404, 'NOT_FOUND', 'File asset not found.')
        if (!access?.signer) throw new HttpError(503, 'STORAGE_UNAVAILABLE', 'Private downloads are not configured.', 1)
        const link = await access.signer.signDownload(asset.id, asset.mimeType)
        await context.auditLog.create({ data: { actorUserId: actor.userId, entityType: 'file_asset', entityId: id, action: 'file_asset.download_link_issued', requestId: identity.requestId, afterData: { id, driverId: asset.driverId }, createdAt: new Date() } })
        return link
      }), { isolationLevel: 'ReadCommitted', maxWait: 2000, timeout: 5000 })
    },
  }
}
export type FileService = ReturnType<typeof createFileService>
