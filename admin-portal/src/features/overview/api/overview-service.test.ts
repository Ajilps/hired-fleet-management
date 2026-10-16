import { describe, expect, it, vi } from 'vitest'
import { createOverviewList } from '../../../test/overview-fixtures'
import { ApiError } from '../../../shared/api/api-client'
import { getOverviewSummary } from './overview-service'

describe('overview list contracts', () => {
  it.each([
    ['orders', '/orders', 'received'], ['ongoing', '/trips', 'ongoing'],
    ['unassigned', '/trips', 'unassigned'], ['statements', '/statements', 'pending_verification'],
  ] as const)('requests %s with the documented status and uses full-range totals', async (section, path, status) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(createOverviewList(status, 12)))
    vi.stubGlobal('fetch', fetchMock)
    const result = await getOverviewSummary(section, 'synthetic-token', new AbortController().signal)
    const limit = section === 'orders' ? 3 : 1
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1${path}?status=${status}&limit=${limit}`, expect.objectContaining({
      headers: { Accept: 'application/json', Authorization: 'Bearer synthetic-token' },
      credentials: 'omit', signal: expect.any(AbortSignal),
    }))
    expect(result.totalCount).toBe(12)
    expect(result.items).toHaveLength(limit)
    expect(result.items[0]).not.toHaveProperty('status')
    expect(result.items[0]).not.toHaveProperty('requestedPickupAt')
  })

  it.each([
    {}, { items: [], pageInfo: {} },
    { items: [], pageInfo: { totalCount: -1, hasMore: false, nextCursor: null } },
    { items: [], pageInfo: { totalCount: '0', hasMore: false, nextCursor: null } },
    { items: [], pageInfo: { totalCount: 2, hasMore: true, nextCursor: null } },
    { items: [], pageInfo: { totalCount: 2, hasMore: false, nextCursor: null } },
  ])('rejects malformed envelopes instead of displaying a false zero: %j', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(response)))
    await expect(getOverviewSummary('orders', 'synthetic-token', new AbortController().signal)).rejects.toMatchObject({ status: 502 })
  })

  it.each([
    { status: 'accepted' }, { requestedPickupAt: 'not-a-date' }, { requestedPickupAt: '2026-10-16T12:00:00' },
    { pickup: null }, { drop: { address: '' } }, { companyId: null }, { requestedPickupAt: '2026-02-30T12:00:00Z' },
  ])('rejects invalid or mismatched records: %j', async (overrides) => {
    const response = createOverviewList('received', 1)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...response, items: [{ ...response.items[0], ...overrides }] })))
    await expect(getOverviewSummary('orders', 'synthetic-token', new AbortController().signal)).rejects.toMatchObject({ status: 502 })
  })

  it('rejects an impossible statement period date', async () => {
    const response = createOverviewList('pending_verification', 1)
    response.items[0].periodStart = '2026-02-30'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(response)))
    await expect(getOverviewSummary('statements', 'synthetic-token', new AbortController().signal)).rejects.toMatchObject({ status: 502 })
  })

  it('cancels the underlying request when the query is cancelled', async () => {
    const controller = new AbortController()
    let requestSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options: RequestInit) => {
      requestSignal = options.signal as AbortSignal
      return new Promise((_resolve, reject) => requestSignal!.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError'))))
    }))
    const request = getOverviewSummary('orders', 'synthetic-token', controller.signal)
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(requestSignal?.aborted).toBe(true)
  })

  it.each([401, 403, 429, 503])('preserves HTTP %s for shared session/error handling', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status })))
    await expect(getOverviewSummary('orders', 'synthetic-token', new AbortController().signal)).rejects.toEqual(expect.objectContaining<Partial<ApiError>>({ name: 'ApiError', status, message: expect.any(String) }))
  })
})
