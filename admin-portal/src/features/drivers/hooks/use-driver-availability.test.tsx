import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { createAdminSession } from '../../../test/auth-fixtures'
import { availabilityDateResponse, availabilityList } from '../../../test/driver-availability-fixtures'
import { SECOND_DRIVER_ID, TEST_DRIVER_ID } from '../../../test/driver-fixtures'
import { createTestQueryClient } from '../../../test/query-clients'
import { useDriverAvailability } from './use-driver-availability'

function renderCalendar(initialProps = { id: TEST_DRIVER_ID, from: '2026-10-01', to: '2026-11-01', enabled: true }) {
  useAuthStore.getState().establishSession(createAdminSession())
  const queryClient = createTestQueryClient()
  function Wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> }
  return { queryClient, ...renderHook(({ id, from, to, enabled }) => useDriverAvailability(id, from, to, enabled), { initialProps, wrapper: Wrapper }) }
}
describe('calendar query isolation and lifecycle', () => {
  it('scopes cache data by admin, driver and exact range without reusing records for another driver/month', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const params = new URL(url, 'https://example.test').searchParams
      const date = params.get('fromDate')!
      return Response.json(availabilityList([availabilityDateResponse({ availabilityDate: date, note: url.includes(SECOND_DRIVER_ID) ? 'Second driver' : 'First driver' })]))
    }))
    const { result, rerender, queryClient } = renderCalendar()
    await waitFor(() => expect(result.current.data?.[0].note).toBe('First driver'))
    rerender({ id: SECOND_DRIVER_ID, from: '2026-11-01', to: '2026-12-01', enabled: true })
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data?.[0].note).toBe('Second driver'))
    expect(queryClient.getQueryData(['driver-availability', createAdminSession().user.email, TEST_DRIVER_ID, '2026-10-01', '2026-11-01'])).toMatchObject([{ note: 'First driver' }])
  })
  it('does not fetch invalid or disabled ranges', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const { rerender } = renderCalendar({ id: 'bad-id', from: '', to: '', enabled: true })
    rerender({ id: TEST_DRIVER_ID, from: '2026-10-01', to: '2026-11-01', enabled: false })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([401, 403])('handles calendar status %s with the correct session boundary', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: {} }, { status })))
    const { result, queryClient } = renderCalendar()
    queryClient.setQueryData(['private-cache'], { private: true })
    await waitFor(() => expect(status === 401 ? useAuthStore.getState().session === null : result.current.isError).toBe(true))
    expect(Boolean(useAuthStore.getState().session)).toBe(status === 403)
    expect(queryClient.getQueryData(['private-cache'])).toEqual(status === 403 ? { private: true } : undefined)
  })
  it('retains explicitly stale data after refresh failure and does not automatically retry', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(availabilityList())).mockResolvedValue(Response.json({ error: {} }, { status: 503 }))
    vi.stubGlobal('fetch', fetch)
    const { result } = renderCalendar()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data?.[0].isAvailable).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('aborts an old range and ignores its late result after switching months', async () => {
    let finish!: (response: Response) => void
    let oldSignal: AbortSignal | undefined
    const fetch = vi.fn((_url: string, options: RequestInit) => { oldSignal = options.signal as AbortSignal; return new Promise<Response>((resolve) => { finish = resolve }) })
    vi.stubGlobal('fetch', fetch)
    const { result, rerender } = renderCalendar()
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    const first = finish
    const firstSignal = oldSignal!
    fetch.mockResolvedValueOnce(Response.json(availabilityList([availabilityDateResponse({ availabilityDate: '2026-11-01', note: 'New month' })])))
    rerender({ id: TEST_DRIVER_ID, from: '2026-11-01', to: '2026-12-01', enabled: true })
    await waitFor(() => expect(result.current.data?.[0].note).toBe('New month'))
    expect(firstSignal.aborted).toBe(true)
    await act(async () => { first(Response.json(availabilityList())) })
    expect(result.current.data?.[0].note).toBe('New month')
  })
})
