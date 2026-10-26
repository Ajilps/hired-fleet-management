import { describe, expect, it, vi } from 'vitest'
import { driverList, driverResponse, pendingDriverResponse, TEST_DRIVER_ID } from '../../../test/driver-fixtures'
import { getDriver, listDrivers } from './driver-service'

const signal = () => new AbortController().signal
const active = { status: 'active' as const, online: '' as const, cursor: '' }
function mockResponse(body: unknown, init?: ResponseInit) {
  const mock = vi.fn().mockResolvedValue(Response.json(body, init))
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('driver API contract', () => {
  it('sends server status/online filters, preserves opaque cursors and full-range totals', async () => {
    const mock = mockResponse(driverList([driverResponse({ isOnline: true })], 50, 'next-page'))
    const abort = signal()
    const result = await listDrivers({ ...active, online: 'true', cursor: 'a/b?c' }, 'token', abort)
    const url = new URL(mock.mock.calls[0][0], 'https://example.test')
    expect([...url.searchParams]).toEqual([['limit', '25'], ['status', 'active'], ['isOnline', 'true'], ['cursor', 'a/b?c']])
    expect(result.pageInfo.totalCount).toBe(50)
    expect(mock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer token' }, cache: 'no-store', credentials: 'omit', signal: expect.any(AbortSignal) })
  })
  it('supports pending applications with missing optional profile fields and activation history', async () => {
    const pending = pendingDriverResponse()
    const mock = mockResponse(driverList([pending]))
    const result = await listDrivers({ ...active, status: 'pending' }, 'token', signal())
    expect(result.items[0]).toMatchObject({ dateOfBirth: null, homeAddress: null, onboardedAt: null, user: { phone: null } })
    expect(mock.mock.calls[0][0]).toBe('/api/v1/drivers?limit=25&status=pending')
  })
  it.each([{ status: 'verified' }, { isOnline: 'false' }, { dateOfBirth: '2026-02-30' }, { dateOfBirth: '1995-2-28' }, { createdAt: '2026-02-30T00:00:00Z' }, { activatedByUserId: 'bad-id' }, { homeAddress: 'x'.repeat(2001) }, { onboardedAt: undefined }])('rejects malformed driver data %j', async (overrides) => {
    mockResponse(driverResponse(overrides))
    await expect(getDriver(TEST_DRIVER_ID, 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
  it.each([{ role: 'partner' }, { companyId: TEST_DRIVER_ID }, { driverId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, { isActive: 'yes' }, { fullName: ' ' }, { email: 'bad email' }, { phone: 'x'.repeat(31) }])('rejects inconsistent or malformed user data %j', async (overrides) => {
    mockResponse(driverResponse({ user: { ...driverResponse().user, ...overrides } }))
    await expect(getDriver(TEST_DRIVER_ID, 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
  it('rejects a different detail identity', async () => {
    mockResponse(pendingDriverResponse())
    await expect(getDriver(TEST_DRIVER_ID, 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
  it('discards undeclared credentials and private URLs from cached records', async () => {
    mockResponse(driverResponse({ password: 'synthetic-secret', signedUrl: 'https://example.test/private', user: { ...driverResponse().user, accessToken: 'synthetic-token' } }))
    const result = await getDriver(TEST_DRIVER_ID, 'token', signal())
    expect(result).not.toHaveProperty('password')
    expect(result).not.toHaveProperty('signedUrl')
    expect(result.user).not.toHaveProperty('accessToken')
  })
  it.each([
    driverList([driverResponse(), driverResponse()]),
    driverList([pendingDriverResponse()]),
    { items: [driverResponse()], pageInfo: { totalCount: 0, hasMore: false, nextCursor: null } },
    { items: [], pageInfo: { totalCount: 5, hasMore: true, nextCursor: 'next' } },
  ])('rejects duplicate, out-of-filter or invalid pagination results', async (body) => {
    mockResponse(body)
    await expect(listDrivers(active, 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
  it('rejects incorrect online filtering and repeated cursors', async () => {
    mockResponse(driverList())
    await expect(listDrivers({ ...active, online: 'true' }, 'token', signal())).rejects.toMatchObject({ status: 502 })
    mockResponse(driverList([driverResponse()], 30, 'same'))
    await expect(listDrivers({ ...active, cursor: 'same' }, 'token', signal())).rejects.toMatchObject({ status: 502 })
  })
  it.each([401, 403, 404, 429])('propagates protected read failure %s', async (status) => {
    mockResponse({ error: { retryAfterSeconds: 10 } }, { status })
    await expect(getDriver(TEST_DRIVER_ID, 'token', signal())).rejects.toMatchObject({ status })
  })
  it('preserves cancellation without converting it to a connection failure', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => { options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))) })))
    const request = getDriver(TEST_DRIVER_ID, 'token', controller.signal)
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
})
