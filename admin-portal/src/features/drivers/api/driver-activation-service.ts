import { requestAuthenticatedJson } from '../../../shared/api/api-client'
import { invalidResponse, readId, readObject } from '../../../shared/api/response-validation'
import { documentLabels } from '../types/driver-document-types'
import type { DocumentType } from '../types/driver-document-types'
import { getDriver } from './driver-service'
import { listDriverDocuments } from './driver-document-service'

export async function getDriverActivationReadiness(id: string, token: string, signal: AbortSignal) {
  const driver = await getDriver(id, token, signal)
  signal.throwIfAborted()
  const documents = await listDriverDocuments(id, token, signal)
  const scans = await Promise.all(documents.map(async (document) => {
    const asset = readObject(await requestAuthenticatedJson(`/api/v1/file-assets/${encodeURIComponent(document.fileAssetId)}`, { accessToken: token, signal }))
    signal.throwIfAborted()
    if (readId(asset.id) !== document.fileAssetId || !['pending', 'clean', 'rejected'].includes(asset.scanStatus as string)) return invalidResponse()
    return { documentType: document.documentType, scanStatus: asset.scanStatus as 'pending' | 'clean' | 'rejected' }
  }))
  const blockers: string[] = []
  if (driver.status !== 'pending') blockers.push('The driver is no longer pending. Refresh the profile to review its current status.')
  if (!driver.user.isActive) blockers.push('The user account must be enabled before activation.')
  for (const type of Object.keys(documentLabels) as DocumentType[]) {
    const scan = scans.find((item) => item.documentType === type)
    if (!scan) blockers.push(`${documentLabels[type]}: current upload missing.`)
    else if (scan.scanStatus === 'pending') blockers.push(`${documentLabels[type]}: safety scan pending.`)
    else if (scan.scanStatus === 'rejected') blockers.push(`${documentLabels[type]}: safety scan rejected.`)
  }
  // Only readiness and allowed profile fields enter server-state caches; no links or file bytes.
  return { driver, scans, blockers, ready: blockers.length === 0 }
}
