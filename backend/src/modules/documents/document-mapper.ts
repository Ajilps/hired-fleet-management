import type { Prisma } from '../../generated/prisma/client.ts'
export const documentSelect = { id: true, driverId: true, documentType: true, fileAssetId: true, maskedDocumentNumber: true, expiresOn: true, isCurrent: true, uploadedAt: true } as const
export type DocumentRecord = Prisma.DriverDocumentGetPayload<{ select: typeof documentSelect }>
export const documentTypeMap = { driving_license: 'DrivingLicense', aadhar: 'Aadhar', pan: 'Pan', pcc: 'Pcc' } as const
const apiTypeMap = { DrivingLicense: 'driving_license', Aadhar: 'aadhar', Pan: 'pan', Pcc: 'pcc' } as const
export function documentDto(row: DocumentRecord) {
  return { id: row.id, driverId: row.driverId, documentType: apiTypeMap[row.documentType], fileAssetId: row.fileAssetId, maskedDocumentNumber: row.maskedDocumentNumber, expiresOn: row.expiresOn?.toISOString().slice(0, 10) ?? null, isCurrent: row.isCurrent, uploadedAt: row.uploadedAt.toISOString() }
}
