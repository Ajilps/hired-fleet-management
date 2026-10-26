import { describe, expect, it, vi } from 'vitest'
import { availabilityDateResponse, availabilityList } from '../../../test/driver-availability-fixtures'
import { TEST_DRIVER_ID } from '../../../test/driver-fixtures'
import { listDriverAvailability } from './driver-availability-service'

const signal = () => new AbortController().signal
const request = () => listDriverAvailability(TEST_DRIVER_ID, '2026-10-01', '2026-11-01', 'token', signal())
describe('driver availability contract', () => {
  it('requests a driver-scoped exclusive local-date range and completes opaque pagination before exposing results', async () => {
    const first = availabilityDateResponse({ availabilityDate: '2026-10-01', isAvailable: false, note: null })
    const second = availabilityDateResponse({ availabilityDate: '2026-10-31', note: '' })
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(availabilityList([first], 2, 'a/b?c'))).mockResolvedValueOnce(Response.json(availabilityList([second], 2)))
    vi.stubGlobal('fetch', fetch)
    const result = await request()
    expect(result).toEqual([first, second])
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([`/api/v1/drivers/${TEST_DRIVER_ID}/availability-dates?limit=25&fromDate=2026-10-01&toDate=2026-11-01`, `/api/v1/drivers/${TEST_DRIVER_ID}/availability-dates?limit=25&fromDate=2026-10-01&toDate=2026-11-01&cursor=a%2Fb%3Fc`])
    expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer token' }, credentials: 'omit', cache: 'no-store' })
    expect(fetch.mock.calls.every(([, options]) => !options.method || options.method === 'GET')).toBe(true)
  })
  it.each([{ availabilityDate: '2026-02-30' }, { availabilityDate: '2026-09-30' }, { availabilityDate: '2026-11-01' }, { isAvailable: 'true' }, { note: 'x'.repeat(251) }, { note: undefined }, { updatedAt: '2026-02-30T00:00:00Z' }])('rejects malformed or out-of-range data %j', async (overrides) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(availabilityList([availabilityDateResponse(overrides)]))))
    await expect(request()).rejects.toMatchObject({ status: 502 })
  })
  it('rejects duplicates and descending date order across pages', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(availabilityList([availabilityDateResponse()], 2, 'next'))).mockResolvedValueOnce(Response.json(availabilityList([availabilityDateResponse({ availabilityDate: '2026-10-16' })], 2)))
    vi.stubGlobal('fetch', fetch)
    await expect(request()).rejects.toMatchObject({ status: 502 })
    fetch.mockResolvedValueOnce(Response.json(availabilityList([availabilityDateResponse(), availabilityDateResponse()])))
    await expect(request()).rejects.toMatchObject({ status: 502 })
  })
  it('rejects cursor loops and inconsistent whole-range totals', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(availabilityList([availabilityDateResponse()], 3, 'same'))).mockResolvedValueOnce(Response.json(availabilityList([availabilityDateResponse({ availabilityDate: '2026-10-18' })], 3, 'same')))
    vi.stubGlobal('fetch', fetch)
    await expect(request()).rejects.toMatchObject({ status: 502 })
    fetch.mockResolvedValueOnce(Response.json(availabilityList([], 32)))
    await expect(request()).rejects.toMatchObject({ status: 502 })
    fetch.mockResolvedValueOnce(Response.json(availabilityList([availabilityDateResponse()], 2)))
    await expect(request()).rejects.toMatchObject({ status: 502 })
  })
  it('allowlists only calendar display fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(availabilityList([availabilityDateResponse({ signedUrl: 'https://example.test/private', storageKey: 'private-key' })]))))
    const result = await request()
    expect(result[0]).not.toHaveProperty('signedUrl')
    expect(result[0]).not.toHaveProperty('storageKey')
  })
  it.each([['bad-id', '2026-10-01', '2026-11-01'], [TEST_DRIVER_ID, '2026-02-30', '2026-03-01'], [TEST_DRIVER_ID, '2026-10-01', '2026-10-01'], [TEST_DRIVER_ID, '2026-10-02', '2026-10-01'], [TEST_DRIVER_ID, '2026-10-01', '2026-12-01']])('blocks invalid route/range before any HTTP call', async (id, from, to) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(listDriverAvailability(id, from, to, 'token', signal())).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([401, 403, 404, 429])('propagates protected calendar failure %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { retryAfterSeconds: 5 } }, { status })))
    await expect(request()).rejects.toMatchObject({ status })
  })
  it('does not expose partial calendar records when a later page fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(availabilityList([availabilityDateResponse()], 2, 'next'))).mockResolvedValueOnce(Response.json({ error: {} }, { status: 503 })))
    await expect(request()).rejects.toMatchObject({ status: 503 })
  })
  it('stops after an aborted response even if the transport resolves late', async () => {
    const controller = new AbortController()
    const fetch = vi.fn(async () => { controller.abort(); return Response.json(availabilityList([availabilityDateResponse()], 2, 'next')) })
    vi.stubGlobal('fetch', fetch)
    await expect(listDriverAvailability(TEST_DRIVER_ID, '2026-10-01', '2026-11-01', 'token', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
