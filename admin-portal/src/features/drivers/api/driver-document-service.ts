import { ApiError, requestAuthenticatedJson } from '../../../shared/api/api-client'
import { invalidResponse, readId, readObject, readPage, readText, readTimestamp } from '../../../shared/api/response-validation'
import { documentLabels } from '../types/driver-document-types'
import type { DocumentType, DriverDocument, PreviewMimeType, PrivateDocumentContent } from '../types/driver-document-types'

// Browser preview budget; backend upload limits and content scanning remain server policies.
const maxPreviewBytes = 10 * 1024 * 1024

function readDocument(value: unknown, driverId: string): DriverDocument {
  const row = readObject(value)
  if (readId(row.driverId) !== driverId || row.isCurrent !== true || typeof row.documentType !== 'string' || !Object.hasOwn(documentLabels, row.documentType)) return invalidResponse()
  let expiresOn = null
  if (row.expiresOn !== null) {
    expiresOn = readText(row.expiresOn)
    const time = Date.parse(expiresOn)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== expiresOn) return invalidResponse()
  }
  // Document numbers, storage keys, bytes and signed links are excluded from ordinary query data.
  return { id: readId(row.id), driverId, documentType: row.documentType as DocumentType, fileAssetId: readId(row.fileAssetId), uploadedAt: readTimestamp(row.uploadedAt), expiresOn }
}

export async function listDriverDocuments(driverId: string, token: string, signal: AbortSignal) {
  const documents: DriverDocument[] = []
  const seen = new Set<string>()
  let cursor = ''
  // At most one current document per type. Finish pagination before reporting a type missing.
  for (let page = 0; page < 4; page++) {
    signal.throwIfAborted()
    const params = new URLSearchParams({ limit: '25', isCurrent: 'true' })
    if (cursor) params.set('cursor', cursor)
    const row = readObject(await requestAuthenticatedJson(`/api/v1/drivers/${encodeURIComponent(driverId)}/documents?${params}`, { accessToken: token, signal }))
    signal.throwIfAborted()
    if (!Array.isArray(row.items)) return invalidResponse()
    const items = row.items.map((value) => readDocument(value, driverId))
    const info = readPage(row.pageInfo, items.length, 25)
    documents.push(...items)
    if (info.totalCount > 4 || new Set(documents.map((document) => document.id)).size !== documents.length || new Set(documents.map((document) => document.documentType)).size !== documents.length) return invalidResponse()
    if (!info.hasMore) return documents.length === info.totalCount ? documents : invalidResponse()
    if (!info.nextCursor || seen.has(info.nextCursor)) return invalidResponse()
    seen.add(info.nextCursor)
    cursor = info.nextCursor
  }
  return invalidResponse()
}

function readDownloadLink(value: unknown) {
  const row = readObject(value)
  const url = readText(row.url)
  let parsed: URL
  try { parsed = new URL(url) } catch { return invalidResponse() }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) return invalidResponse()
  const expiresAt = readTimestamp(row.expiresAt)
  if (Date.parse(expiresAt) <= Date.now()) throw new ApiError(410, 'The private link expired. Try again to request a new preview.')
  return { url, expiresAt }
}

function matchesSignature(bytes: Uint8Array, mimeType: PreviewMimeType) {
  if (mimeType === 'application/pdf') return [37, 80, 68, 70, 45].every((byte, index) => bytes[index] === byte)
  if (mimeType === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
}

export async function loadPrivateDocument(assetId: string, token: string, signal: AbortSignal): Promise<PrivateDocumentContent> {
  const asset = readObject(await requestAuthenticatedJson(`/api/v1/file-assets/${encodeURIComponent(assetId)}`, { accessToken: token, signal }))
  signal.throwIfAborted()
  if (readId(asset.id) !== assetId || !['pending', 'clean', 'rejected'].includes(asset.scanStatus as string) || !Number.isSafeInteger(asset.sizeBytes) || (asset.sizeBytes as number) < 1) return invalidResponse()
  if (asset.scanStatus !== 'clean') throw new ApiError(409, asset.scanStatus === 'pending' ? 'This file is still being scanned. Refresh the preview later.' : 'This file is unavailable because its safety scan was rejected.')
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(asset.mimeType as string)) throw new ApiError(415, 'This file type cannot be previewed. Supported types are PDF, JPEG and PNG.')
  if ((asset.sizeBytes as number) > maxPreviewBytes) throw new ApiError(413, 'This file is too large to preview. The preview limit is 10 MiB.')
  const mimeType = asset.mimeType as PreviewMimeType
  const link = readDownloadLink(await requestAuthenticatedJson(`/api/v1/file-assets/${encodeURIComponent(assetId)}/download-links`, { method: 'POST', accessToken: token, signal }))
  signal.throwIfAborted()
  let response: Response
  try {
    // Never forward the API bearer token or cookies to a signed storage URL.
    response = await fetch(link.url, { signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error' })
  } catch {
    signal.throwIfAborted()
    throw new ApiError(0, 'Unable to load the private file. Check your connection and storage access, then try again.')
  }
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new ApiError(410, 'The private file is unavailable or its link expired. Try again for a new preview.') }
  const contentType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()
  if (contentType !== mimeType && contentType !== 'application/octet-stream') { await response.body?.cancel().catch(() => undefined); return invalidResponse() }
  if (!response.body) return invalidResponse()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxPreviewBytes || size > (asset.sizeBytes as number)) throw new ApiError(413, 'The private file exceeds its declared preview size.')
      chunks.push(value)
    }
  } catch (failure) {
    await reader.cancel().catch(() => undefined)
    signal.throwIfAborted()
    if (failure instanceof ApiError) throw failure
    throw new ApiError(0, 'The private file could not finish loading. Try again for a new preview.')
  } finally { reader.releaseLock() }
  signal.throwIfAborted()
  if (size !== asset.sizeBytes) return invalidResponse()
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  if (!matchesSignature(bytes, mimeType)) throw new ApiError(415, 'The private file content does not match its declared type.')
  if (Date.parse(link.expiresAt) <= Date.now()) throw new ApiError(410, 'The private link expired while loading. Try again for a new preview.')
  return { blob: new Blob([bytes], { type: mimeType }), mimeType, expiresAt: link.expiresAt }
}
