import { TEST_DRIVER_ID } from './driver-fixtures'

export const TEST_ASSET_ID = '20000000-0000-4000-8000-000000000001'
export const TEST_PRIVATE_URL = 'https://files.example.test/private-document?signature=synthetic-only'
export const TEST_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6t8AAAAASUVORK5CYII='
export function syntheticPng() { return Uint8Array.from(atob(TEST_PNG_BASE64), (char) => char.charCodeAt(0)) }
export function driverDocumentResponse(overrides: Record<string, unknown> = {}) {
  return { id: '10000000-0000-4000-8000-000000000001', driverId: TEST_DRIVER_ID, documentType: 'driving_license', fileAssetId: TEST_ASSET_ID, maskedDocumentNumber: 'TEST-••••-1234', expiresOn: '2030-10-01', isCurrent: true, uploadedAt: '2026-10-16T08:00:00Z', ...overrides }
}
export function allDriverDocuments() {
  return ['driving_license', 'aadhar', 'pan', 'pcc'].map((documentType, index) => driverDocumentResponse({ documentType, id: `10000000-0000-4000-8000-00000000000${index + 1}`, fileAssetId: `20000000-0000-4000-8000-00000000000${index + 1}` }))
}
export function driverDocumentList(items = [driverDocumentResponse()], totalCount = items.length, nextCursor: string | null = null) {
  return { items, pageInfo: { totalCount, hasMore: nextCursor !== null, nextCursor } }
}
export function fileAssetResponse(overrides: Record<string, unknown> = {}) {
  return { id: TEST_ASSET_ID, originalFilename: 'synthetic-document.png', mimeType: 'image/png', sizeBytes: syntheticPng().byteLength, checksumSha256: null, scanStatus: 'clean', uploadedByUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', createdAt: '2026-10-16T08:00:00Z', ...overrides }
}
export function downloadLinkResponse(overrides: Record<string, unknown> = {}) {
  return { url: TEST_PRIVATE_URL, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides }
}
export function syntheticPdf() {
  const stream = 'BT /F1 20 Tf 50 180 Td (SYNTHETIC TEST DOCUMENT) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(pdf)
}
