import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/api/api-client'
import { createOrderInput, createOrderResponse, createTripResponse, orderListResponse, TEST_ORDER_ID } from '../../../test/order-fixtures'
import { filtersFromParams } from '../validation/order-validation'
import { createOrder, decideOrder, getOrder, listOrders } from './order-service'

describe('orders API contracts', () => {
  it('sends only supported filters with inclusive/exclusive IST boundaries and opaque cursor', async () => {
    const mock = vi.fn().mockResolvedValue(Response.json(orderListResponse()))
    vi.stubGlobal('fetch', mock)
    await listOrders(filtersFromParams(new URLSearchParams('from=2026-10-16&to=2026-10-16&search=airport&source=admin_phone&cursor=a%2Fb')), 'synthetic-token', new AbortController().signal)
    const url = new URL(mock.mock.calls[0][0], 'https://example.test')
    expect(url.searchParams.get('createdFrom')).toBe('2026-10-16T00:00:00+05:30')
    expect(url.searchParams.get('createdTo')).toBe('2026-10-17T00:00:00+05:30')
    expect(url.searchParams.get('cursor')).toBe('a/b')
    expect(url.searchParams.has('source')).toBe(false)
    expect(url.searchParams.has('search')).toBe(false)
  })
  it('reads a strong ETag and blocks malformed weak versions from writes', async () => {
    const mock = vi.fn().mockResolvedValueOnce(Response.json(createOrderResponse(), { headers: { ETag: '"v1"' } })).mockResolvedValueOnce(Response.json(createOrderResponse(), { headers: { ETag: 'W/"v1"' } }))
    vi.stubGlobal('fetch', mock)
    expect((await getOrder(TEST_ORDER_ID, 'token', new AbortController().signal)).etag).toBe('"v1"')
    expect((await getOrder(TEST_ORDER_ID, 'token', new AbortController().signal)).etag).toBeNull()
  })
  it('creates only admin intake fields with idempotency and no If-Match', async () => {
    const mock = vi.fn().mockResolvedValue(Response.json(createOrderResponse(), { status: 201 }))
    vi.stubGlobal('fetch', mock)
    const input = createOrderInput()
    await createOrder(input, 'same-command', 'token')
    expect(mock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(input), headers: { 'Idempotency-Key': 'same-command', 'Content-Type': 'application/json' } })
    expect(mock.mock.calls[0][1].headers).not.toHaveProperty('If-Match')
  })
  it('accepts with exact decimal strings, version and command identity and validates the resulting trip', async () => {
    const mock = vi.fn().mockResolvedValue(Response.json({ order: createOrderResponse('accepted'), trip: createTripResponse() }, { headers: { ETag: '"v2"' } }))
    vi.stubGlobal('fetch', mock)
    const result = await decideOrder(TEST_ORDER_ID, 'accept', { totalAmount: '10000.00' }, '"v1"', 'command-key', 'token')
    expect(result.order.tripId).toBe(createTripResponse().id)
    expect(mock.mock.calls[0][1]).toMatchObject({ body: '{"totalAmount":"10000.00"}', headers: { 'If-Match': '"v1"', 'Idempotency-Key': 'command-key' } })
  })
  it.each([{ status: 'ongoing' }, { orderId: '55555555-5555-4555-8555-555555555555' }, { totalAmount: '10.00' }])('rejects a mismatched acceptance result %j', async (trip) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ order: createOrderResponse('accepted'), trip: createTripResponse(trip) })))
    await expect(decideOrder(TEST_ORDER_ID, 'accept', { totalAmount: '10000.00' }, '"v1"', 'key', 'token')).rejects.toMatchObject({ status: 502 })
  })
  it.each([{ status: 'invalid' }, { requestedPickupAt: '2026-02-30T12:00:00Z' }, { contact: null }, { status: 'accepted', tripId: null }])('rejects malformed order data %j', async (overrides) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(createOrderResponse('received', overrides))))
    await expect(getOrder(TEST_ORDER_ID, 'token', new AbortController().signal)).rejects.toMatchObject({ status: 502 })
  })
  it('preserves rate-limit guidance from the header over the JSON fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'RATE_LIMITED', retryAfterSeconds: 90 } }, { status: 429, headers: { 'Retry-After': '2' } })))
    const now = Date.now()
    try { await createOrder(createOrderInput(), 'key', 'token') } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).retryAt).toBeGreaterThanOrEqual(now + 2000)
      expect((error as ApiError).retryAt).toBeLessThan(now + 3000)
    }
  })
  it('rejects a decision response which does not confirm the entered rejection reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(createOrderResponse('rejected'))))
    await expect(decideOrder(TEST_ORDER_ID, 'reject', { reason: 'Different reason' }, '"v1"', 'key', 'token')).rejects.toMatchObject({ status: 502 })
  })
})
