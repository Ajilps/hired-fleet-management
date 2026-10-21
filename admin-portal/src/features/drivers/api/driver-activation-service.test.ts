import { describe, expect, it, vi } from 'vitest'
import { activationDriver, activatedDriverResponse, ACTIVATION_DRIVER_ID } from '../../../test/driver-activation-fixtures'
import { allDriverDocuments, driverDocumentList, fileAssetResponse } from '../../../test/driver-document-fixtures'
import { pendingDriverResponse } from '../../../test/driver-fixtures'
import { getDriverActivationReadiness } from './driver-activation-service'
import { activateDriver } from './driver-service'

const signal = () => new AbortController().signal
function mockReadiness(driver = pendingDriverResponse(), scanStatus = 'clean', missing = false) {
  const fetch = vi.fn(async (url: string) => {
    if (url.includes('/documents?')) return Response.json(driverDocumentList(missing ? [] : allDriverDocuments().map((document) => ({ ...document, driverId: ACTIVATION_DRIVER_ID }))))
    if (url.includes('/file-assets/')) return Response.json(fileAssetResponse({ id: url.split('/').at(-1), scanStatus }))
    return Response.json(driver)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
describe('driver activation readiness', () => {
  it('requires enabled pending account plus all four current clean uploads without fetching links or bytes', async () => {
    const fetch = mockReadiness()
    const result = await getDriverActivationReadiness(ACTIVATION_DRIVER_ID, 'token', signal())
    expect(result.ready).toBe(true)
    expect(result.blockers).toEqual([])
    expect(result.scans).toHaveLength(4)
    expect(fetch).toHaveBeenCalledTimes(6)
    expect(fetch.mock.calls.every(([url]) => !url.includes('download-links'))).toBe(true)
    expect(JSON.stringify(result)).not.toContain('storageKey')
  })
  it('blocks a disabled user separately from operational status', async () => {
    mockReadiness({ ...pendingDriverResponse(), user: { ...pendingDriverResponse().user, isActive: false } })
    expect((await getDriverActivationReadiness(ACTIVATION_DRIVER_ID, 'token', signal())).blockers).toContain('The user account must be enabled before activation.')
  })
  it.each(['active', 'inactive', 'suspended'])('does not turn %s status into an initial activation', async (status) => {
    mockReadiness({ ...pendingDriverResponse(), status })
    expect((await getDriverActivationReadiness(ACTIVATION_DRIVER_ID, 'token', signal())).ready).toBe(false)
  })
  it.each(['pending', 'rejected'])('blocks %s scans', async (scanStatus) => {
    mockReadiness(pendingDriverResponse(), scanStatus)
    const result = await getDriverActivationReadiness(ACTIVATION_DRIVER_ID, 'token', signal())
    expect(result.ready).toBe(false)
    expect(result.blockers).toHaveLength(4)
    expect(result.blockers.some((blocker) => blocker.startsWith('Aadhaar:'))).toBe(true)
  })
  it('reports missing types only after the complete current-document list', async () => {
    const fetch = mockReadiness(pendingDriverResponse(), 'clean', true)
    const result = await getDriverActivationReadiness(ACTIVATION_DRIVER_ID, 'token', signal())
    expect(result.blockers).toHaveLength(4)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it.each([401, 403, 404, 429])('blocks unavailable scan metadata with status %s', async (status) => {
    const fetch = mockReadiness()
    const original = fetch.getMockImplementation()!
    fetch.mockImplementation(async (url: string) => url.includes('/file-assets/') ? Response.json({ error: { retryAfterSeconds: 3 } }, { status }) : original(url))
    await expect(getDriverActivationReadiness(ACTIVATION_DRIVER_ID, 'token', signal())).rejects.toMatchObject({ status })
  })
  it('rejects swapped file identities and unknown scan statuses', async () => {
    for (const asset of [{ id: ACTIVATION_DRIVER_ID }, { scanStatus: 'verified' }]) {
      const fetch = mockReadiness()
      const original = fetch.getMockImplementation()!
      fetch.mockImplementation(async (url: string) => url.includes('/file-assets/') ? Response.json(fileAssetResponse({ id: url.split('/').at(-1), ...asset })) : original(url))
      await expect(getDriverActivationReadiness(ACTIVATION_DRIVER_ID, 'token', signal())).rejects.toMatchObject({ status: 502 })
    }
  })
})

describe('activation PATCH contract', () => {
  it('sends only status/reason with required idempotency and no undeclared version header', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(activatedDriverResponse()))
    vi.stubGlobal('fetch', fetch)
    const saved = await activateDriver(activationDriver(), 'Operational onboarding complete', 'same-key', 'token', signal())
    expect(saved.status).toBe('active')
    expect(saved.onboardedAt).toBe('2026-10-17T08:00:00Z')
    expect(fetch.mock.calls[0]).toEqual([`/api/v1/drivers/${ACTIVATION_DRIVER_ID}/status`, expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'active', reason: 'Operational onboarding complete' }), headers: { Accept: 'application/json', Authorization: 'Bearer token', 'Content-Type': 'application/json', 'Idempotency-Key': 'same-key', 'X-CSRF-Guard': '1' } })])
  })
  it.each([{ status: 'pending' }, { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, { onboardedAt: null }, { activatedByUserId: null }, { user: { ...pendingDriverResponse().user, isActive: false } }, { user: { ...pendingDriverResponse().user, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' } }])('treats malformed or unrelated success as an unknown command result %j', async (overrides) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(activatedDriverResponse(overrides))))
    await expect(activateDriver(activationDriver(), 'Reason', 'key', 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
  it('preserves previously recorded first activation actor/time', async () => {
    const before = { ...activationDriver(), onboardedAt: '2026-10-16T08:00:00Z', activatedByUserId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(activatedDriverResponse())))
    await expect(activateDriver(before, 'Reason', 'key', 'token', signal())).rejects.toMatchObject({ status: 502 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(activatedDriverResponse({ onboardedAt: before.onboardedAt, activatedByUserId: before.activatedByUserId }))))
    await expect(activateDriver(before, 'Reason', 'key', 'token', signal())).resolves.toMatchObject({ onboardedAt: before.onboardedAt, activatedByUserId: before.activatedByUserId })
  })
  it.each(['', '   ', 'x'.repeat(501), ' Reason '])('blocks invalid or unnormalized audit reasons before a PATCH', async (reason) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(activateDriver(activationDriver(), reason, 'key', 'token', signal())).rejects.toMatchObject({ status: 422 })
    expect(fetch).not.toHaveBeenCalled()
  })
})
