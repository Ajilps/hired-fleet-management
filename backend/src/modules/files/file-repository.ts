import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'

export function createFileRepository(transaction: WorkflowTransaction) {
  return {
    findOwned(id: string, userId: string, driverId?: string) {
      // There are no attachments yet. Operational admin/driver entity access is
      // added with documents/trips, never inferred merely from a target driver ID.
      return transaction.fileAsset.findFirst({ where: { id, uploadedByUserId: userId, ...(driverId ? { driverId } : {}) } })
    },
  }
}
