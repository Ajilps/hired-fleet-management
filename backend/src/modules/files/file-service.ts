import type { PrismaClient } from '../../generated/prisma/client.ts'
import { authenticateTransaction } from '../auth/index.ts'
import type { AuthConfig } from '../auth/index.ts'
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import { createFileRepository } from './file-repository.ts'
import { fileAssetDto } from './file-mapper.ts'

export function createFileService(client: PrismaClient, auth: AuthConfig) {
  return {
    get(accessToken: string, id: string) {
      return client.$transaction((transaction) => withWorkflowTransaction(transaction, async (context) => {
        const actor = await authenticateTransaction(context, accessToken, auth, ['admin', 'partner', 'driver'])
        const asset = actor.role === 'partner' ? null : await createFileRepository(context).findOwned(id, actor.userId, actor.role === 'driver' ? actor.driverId! : undefined)
        if (!asset) throw new HttpError(404, 'NOT_FOUND', 'File asset not found.')
        return fileAssetDto(asset)
      }), { isolationLevel: 'ReadCommitted', maxWait: 2000, timeout: 5000 })
    },
  }
}
export type FileService = ReturnType<typeof createFileService>
