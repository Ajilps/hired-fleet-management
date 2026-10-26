export const documentLabels = { driving_license: 'Driving Licence', aadhar: 'Aadhaar', pan: 'PAN', pcc: 'PCC' } as const
export type DocumentType = keyof typeof documentLabels
export type DriverDocument = { id: string; driverId: string; documentType: DocumentType; fileAssetId: string; uploadedAt: string; expiresOn: string | null }
export type PreviewMimeType = 'image/jpeg' | 'image/png' | 'application/pdf'
export type PrivateDocumentContent = { blob: Blob; mimeType: PreviewMimeType; expiresAt: string }
