import { describe, expect, it, vi } from 'vitest'
import { allDriverDocuments, downloadLinkResponse, driverDocumentList, driverDocumentResponse, fileAssetResponse, syntheticPdf, syntheticPng, TEST_ASSET_ID, TEST_PRIVATE_URL } from '../../../test/driver-document-fixtures'
import { TEST_DRIVER_ID } from '../../../test/driver-fixtures'
import { listDriverDocuments, loadPrivateDocument } from './driver-document-service'

const signal = () => new AbortController().signal
function mockFile(asset = fileAssetResponse(), link = downloadLinkResponse(), file: Response = new Response(syntheticPng(), { headers: { 'Content-Type': 'image/png' } })) {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(asset)).mockResolvedValueOnce(Response.json(link)).mockResolvedValueOnce(file)
  vi.stubGlobal('fetch', fetch)
  return fetch
}
describe('current driver document contract', () => {
  it('finishes cursor pagination before declaring a document missing and allowlists display fields', async () => {
    const documents = allDriverDocuments()
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(driverDocumentList(documents.slice(0, 2), 4, 'a/b?c'))).mockResolvedValueOnce(Response.json(driverDocumentList(documents.slice(2), 4)))
    vi.stubGlobal('fetch', fetch)
    const result = await listDriverDocuments(TEST_DRIVER_ID, 'token', signal())
    expect(result).toHaveLength(4)
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([`/api/v1/drivers/${TEST_DRIVER_ID}/documents?limit=25&isCurrent=true`, `/api/v1/drivers/${TEST_DRIVER_ID}/documents?limit=25&isCurrent=true&cursor=a%2Fb%3Fc`])
    expect(result[0]).not.toHaveProperty('maskedDocumentNumber')
  })
  it.each([{ driverId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, { isCurrent: false }, { documentType: 'aadhaar' }, { fileAssetId: 'bad-id' }, { expiresOn: '2026-02-30' }, { uploadedAt: '2026-02-30T00:00:00Z' }])('rejects unrelated, historical or malformed documents %j', async (overrides) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(driverDocumentList([driverDocumentResponse(overrides)]))))
    await expect(listDriverDocuments(TEST_DRIVER_ID, 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
  it('rejects duplicate current types across pages and cursor loops', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(driverDocumentList([driverDocumentResponse()], 2, 'repeat'))).mockResolvedValueOnce(Response.json(driverDocumentList([driverDocumentResponse({ id: '10000000-0000-4000-8000-000000000002' })], 2)))
    vi.stubGlobal('fetch', fetch)
    await expect(listDriverDocuments(TEST_DRIVER_ID, 'token', signal())).rejects.toMatchObject({ status: 502 })
    const documents = allDriverDocuments()
    fetch.mockResolvedValueOnce(Response.json(driverDocumentList([documents[0]], 4, 'same'))).mockResolvedValueOnce(Response.json(driverDocumentList([documents[1]], 4, 'same')))
    await expect(listDriverDocuments(TEST_DRIVER_ID, 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
  it.each([driverDocumentList([], 5), driverDocumentList([driverDocumentResponse()], 2), driverDocumentList([driverDocumentResponse(), driverDocumentResponse()])])('rejects impossible current totals or duplicate identities', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)))
    await expect(listDriverDocuments(TEST_DRIVER_ID, 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
})

describe('private preview transport and validation', () => {
  it('checks metadata and mints a guarded link, then fetches bytes without credentials', async () => {
    const fetch = mockFile()
    const result = await loadPrivateDocument(TEST_ASSET_ID, 'token', signal())
    expect(result.blob.size).toBe(syntheticPng().byteLength)
    expect(result).not.toHaveProperty('url')
    expect(fetch.mock.calls[0][0]).toBe(`/api/v1/file-assets/${TEST_ASSET_ID}`)
    expect(fetch.mock.calls[1]).toEqual([`/api/v1/file-assets/${TEST_ASSET_ID}/download-links`, expect.objectContaining({ method: 'POST', headers: { Accept: 'application/json', Authorization: 'Bearer token', 'X-CSRF-Guard': '1' }, cache: 'no-store' })])
    expect(fetch.mock.calls[2]).toEqual([TEST_PRIVATE_URL, expect.objectContaining({ credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error' })])
    expect(fetch.mock.calls[2][1]).not.toHaveProperty('headers')
  })
  it.each(['pending', 'rejected'])('never issues a link for a %s scan', async (scanStatus) => {
    const fetch = mockFile(fileAssetResponse({ scanStatus }))
    await expect(loadPrivateDocument(TEST_ASSET_ID, 'token', signal())).rejects.toMatchObject({ status: 409 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each([{ id: 'bad-id' }, { id: '20000000-0000-4000-8000-000000000002' }, { scanStatus: 'verified' }, { sizeBytes: 0 }, { sizeBytes: 1.5 }])('rejects malformed or swapped asset metadata %j', async (asset) => {
    const fetch = mockFile(fileAssetResponse(asset))
    await expect(loadPrivateDocument(TEST_ASSET_ID, 'token', signal())).rejects.toMatchObject({ status: 502 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each([{ mimeType: 'text/html', status: 415 }, { mimeType: 'image/svg+xml', status: 415 }, { sizeBytes: 10 * 1024 * 1024 + 1, status: 413 }])('blocks unsafe formats and oversized previews before link issuance %j', async ({ status, ...asset }) => {
    const fetch = mockFile(fileAssetResponse(asset))
    await expect(loadPrivateDocument(TEST_ASSET_ID, 'token', signal())).rejects.toMatchObject({ status })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each(['javascript:alert(1)', 'data:text/html,test', 'http://files.example.test/file', '//files.example.test/file', 'https://user:password@files.example.test/file', 'https://files.example.test/file#fragment'])('rejects unsafe signed URL %s before fetching it', async (url) => {
    const fetch = mockFile(fileAssetResponse(), downloadLinkResponse({ url }))
    await expect(loadPrivateDocument(TEST_ASSET_ID, 'token', signal())).rejects.toMatchObject({ status: 502 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('rejects already expired links without fetching the file', async () => {
    const fetch = mockFile(fileAssetResponse(), downloadLinkResponse({ expiresAt: '2000-01-01T00:00:00Z' }))
    await expect(loadPrivateDocument(TEST_ASSET_ID, 'token', signal())).rejects.toMatchObject({ status: 410 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('supports native PDF previews with checked MIME, length and signature', async () => {
    const pdf = syntheticPdf()
    mockFile(fileAssetResponse({ mimeType: 'application/pdf', sizeBytes: pdf.byteLength }), downloadLinkResponse(), new Response(pdf, { headers: { 'Content-Type': 'application/pdf' } }))
    expect((await loadPrivateDocument(TEST_ASSET_ID, 'token', signal())).mimeType).toBe('application/pdf')
  })
  it.each([
    new Response('<html>unsafe</html>', { headers: { 'Content-Type': 'image/png' } }),
    new Response(syntheticPng(), { headers: { 'Content-Type': 'text/html' } }),
    new Response(syntheticPng().slice(0, 10), { headers: { 'Content-Type': 'image/png' } }),
  ])('rejects incorrect content or truncated files', async (response) => {
    mockFile(fileAssetResponse(), downloadLinkResponse(), response)
    await expect(loadPrivateDocument(TEST_ASSET_ID, 'token', signal())).rejects.toBeInstanceOf(Error)
  })
  it('bounds streamed content by declared size before buffering a preview', async () => {
    mockFile(fileAssetResponse({ sizeBytes: 4 }))
    await expect(loadPrivateDocument(TEST_ASSET_ID, 'token', signal())).rejects.toMatchObject({ status: 413 })
  })
  it('treats a storage 403 as an expired/unavailable file, without expiring the API session', async () => {
    mockFile(fileAssetResponse(), downloadLinkResponse(), new Response(null, { status: 403 }))
    await expect(loadPrivateDocument(TEST_ASSET_ID, 'token', signal())).rejects.toMatchObject({ status: 410 })
  })
  it.each([401, 403, 404, 429])('preserves API status %s for shared auth and retry handling', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { retryAfterSeconds: 10 } }, { status })))
    await expect(loadPrivateDocument(TEST_ASSET_ID, 'token', signal())).rejects.toMatchObject({ status })
  })
  it('accepts only loopback HTTP storage in development', async () => {
    mockFile(fileAssetResponse(), downloadLinkResponse({ url: 'http://127.0.0.1:8333/synthetic-private' }))
    expect((await loadPrivateDocument(TEST_ASSET_ID, 'token', signal())).blob.size).toBe(syntheticPng().byteLength)
  })
  it('sanitizes storage network failures so signed URLs never appear in feedback', async () => {
    const fetch = mockFile()
    fetch.mockReset().mockResolvedValueOnce(Response.json(fileAssetResponse())).mockResolvedValueOnce(Response.json(downloadLinkResponse())).mockRejectedValueOnce(new Error(`Failed to fetch ${TEST_PRIVATE_URL}`))
    try { await loadPrivateDocument(TEST_ASSET_ID, 'token', signal()); expect.fail('Expected failure') }
    catch (error) { expect(String(error)).not.toContain(TEST_PRIVATE_URL); expect(String(error)).toContain('Unable to load the private file') }
  })
})
