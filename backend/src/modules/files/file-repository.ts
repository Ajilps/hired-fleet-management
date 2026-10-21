import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'

export function createFileRepository(transaction: WorkflowTransaction) {
  return {
    findAccessible(id: string, userId: string, role: 'admin' | 'partner' | 'driver', driverId: string | null) {
      if (role === 'partner') return null
      return transaction.fileAsset.findFirst({ where: { id, OR: [
        { uploadedByUserId: userId, ...(role === 'driver' ? { driverId: driverId! } : {}) },
        { document: { isCurrent: true, ...(role === 'driver' ? { driverId: driverId! } : {}) } },
      ] } })
    },
    async findAttached(id: string, role: 'admin' | 'partner' | 'driver', driverId: string | null) {
      if (role === 'partner') return null
      await transaction.$queryRaw`SELECT d.id FROM driver_documents d JOIN file_assets f ON f.id = d.file_asset_id WHERE f.id = ${id}::uuid AND d.is_current FOR SHARE OF d, f`
      return transaction.fileAsset.findFirst({ where: { id, malwareScanStatus: 'clean', document: { isCurrent: true, ...(role === 'driver' ? { driverId: driverId! } : {}) } } })
    },
    findOwned(id: string, userId: string, driverId?: string) {
      // Uploader ownership alone never grants a download; attachment checks are separate.
      return transaction.fileAsset.findFirst({ where: { id, uploadedByUserId: userId, ...(driverId ? { driverId } : {}) } })
    },
  }
}
