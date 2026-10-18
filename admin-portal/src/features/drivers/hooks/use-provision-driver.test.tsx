import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { createAdminSession } from '../../../test/auth-fixtures'
import { driverInput, provisionedDriverResponse, TEST_DRIVER_PASSWORD } from '../../../test/driver-provisioning-fixtures'
import { createTestQueryClient } from '../../../test/query-clients'
import { useProvisionDriver } from './use-provision-driver'

function renderCommand() {
  useAuthStore.getState().establishSession(createAdminSession())
  const queryClient = createTestQueryClient()
  function Wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> }
  return { queryClient, ...renderHook(() => useProvisionDriver(), { wrapper: Wrapper }) }
}
describe('driver provisioning lifecycle and credential handling', () => {
  it('replays the exact body/key through interruption, in-progress and throttling responses', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Response.json({ error: { code: 'COMMAND_IN_PROGRESS' } }, { status: 409 })).mockResolvedValueOnce(Response.json({ error: {} }, { status: 429 })).mockResolvedValueOnce(Response.json(provisionedDriverResponse()))
    vi.stubGlobal('fetch', fetch)
    const { result, queryClient } = renderCommand()
    await act(async () => { await result.current.run(driverInput()) })
    expect(result.current.isUncertain).toBe(true)
    await act(async () => { await result.current.run({ ...driverInput(), email: 'changed@acme.example' }) })
    await act(async () => { await result.current.run(null) })
    expect(result.current.isUncertain).toBe(true)
    await act(async () => { expect(await result.current.run(null)).toMatchObject({ status: 'pending' }) })
    expect(new Set(fetch.mock.calls.map((call) => call[1].headers['Idempotency-Key'])).size).toBe(1)
    expect(fetch.mock.calls.map((call) => call[1].body)).toEqual(Array(4).fill(JSON.stringify(driverInput())))
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
  })
  it('keeps secrets outside mutation variables/results while pending and clears settled mutations', async () => {
    let complete!: (response: Response) => void
    const fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { complete = resolve }))
    vi.stubGlobal('fetch', fetch)
    const { result, queryClient } = renderCommand()
    let pending!: ReturnType<typeof result.current.run>
    act(() => { pending = result.current.run(driverInput()) })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    const state = queryClient.getMutationCache().getAll()[0].state
    expect(state.variables).toBeUndefined()
    expect(JSON.stringify(state)).not.toContain(TEST_DRIVER_PASSWORD)
    await act(async () => { expect(await result.current.run(driverInput())).toBeUndefined() })
    expect(fetch).toHaveBeenCalledTimes(1)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await act(async () => { complete(Response.json(provisionedDriverResponse())); await pending })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['drivers', createAdminSession().user.email] })
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
  })
  it('uses a new key after definitive failure and corrected credentials', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: {} }, { status: 422 })).mockResolvedValueOnce(Response.json(provisionedDriverResponse()))
    vi.stubGlobal('fetch', fetch)
    const { result } = renderCommand()
    await act(async () => { await result.current.run({ ...driverInput(), initialPassword: 'Old synthetic password' }) })
    expect(result.current.isUncertain).toBe(false)
    await act(async () => { await result.current.run(driverInput()) })
    expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).not.toBe(fetch.mock.calls[1][1].headers['Idempotency-Key'])
  })
  it.each(['logout', 'unmount'])('ignores late results after %s', async (action) => {
    let complete!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => { complete = resolve })))
    const { result, queryClient, unmount } = renderCommand()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let pending!: ReturnType<typeof result.current.run>
    act(() => { pending = result.current.run(driverInput()) })
    await waitFor(() => expect(complete).toBeTypeOf('function'))
    if (action === 'logout') act(() => { useAuthStore.getState().clearSession() })
    else unmount()
    await act(async () => { complete(Response.json(provisionedDriverResponse())); expect(await pending).toBeUndefined() })
    expect(invalidate).not.toHaveBeenCalled()
  })
  it('clears the session and private caches after a provisioning 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: {} }, { status: 401 })))
    const { result, queryClient } = renderCommand()
    queryClient.setQueryData(['private-partner'], { private: true })
    await act(async () => { await result.current.run(driverInput()) })
    expect(useAuthStore.getState().session).toBeNull()
    expect(queryClient.getQueryData(['private-partner'])).toBeUndefined()
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
  })
})
