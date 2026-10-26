import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/use-auth-store'
import { createAdminSession } from '../../../test/auth-fixtures'
import { createTestQueryClient } from '../../../test/query-clients'
import { useChangePassword } from './use-change-password'

const input = { currentPassword: 'synthetic-current-password', newPassword: 'synthetic-new-password' }
function renderCommand() {
  useAuthStore.getState().establishSession(createAdminSession())
  const queryClient = createTestQueryClient()
  function Wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> }
  return { queryClient, ...renderHook(() => useChangePassword(), { wrapper: Wrapper }) }
}
describe('credential transition privacy and session races', () => {
  it('keeps passwords out of mutation variables/results, blocks duplicate dispatch and clears private state on success', async () => {
    let complete!: (response: Response) => void
    const fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { complete = resolve })); vi.stubGlobal('fetch', fetch)
    const { result, queryClient } = renderCommand(); queryClient.setQueryData(['private'], ['synthetic-record'])
    let pending!: ReturnType<typeof result.current.run>
    act(() => { pending = result.current.run(input) })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    const state = queryClient.getMutationCache().getAll()[0]!.state
    expect(state.variables).toBeUndefined(); expect(JSON.stringify(state)).not.toContain(input.currentPassword); expect(JSON.stringify(state)).not.toContain(input.newPassword)
    await act(async () => { expect(await result.current.run(input)).toBe(false) })
    await act(async () => { complete(new Response(null, { status: 204 })); expect(await pending).toBe(true) })
    expect(useAuthStore.getState().session).toBeNull(); expect(queryClient.getQueryData(['private'])).toBeUndefined()
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
  })
  it('does not automatically retry or permit a second password change after an uncertain response', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetch)
    const { result } = renderCommand()
    await act(async () => { await result.current.run(input) })
    expect(result.current.isUncertain).toBe(true)
    await act(async () => { expect(await result.current.run(input)).toBe(false) })
    expect(fetch).toHaveBeenCalledTimes(1); expect(useAuthStore.getState().session).not.toBeNull()
  })
  it.each(['new-session', 'unmount'])('ignores late success after %s and aborts abandoned transport', async (action) => {
    let complete!: (response: Response) => void
    const fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { complete = resolve })); vi.stubGlobal('fetch', fetch)
    const { result, unmount } = renderCommand(); let pending!: ReturnType<typeof result.current.run>
    act(() => { pending = result.current.run(input) }); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    if (action === 'unmount') unmount()
    else act(() => useAuthStore.getState().establishSession({ ...createAdminSession(), accessToken: 'replacement-session' }))
    await act(async () => { complete(new Response(null, { status: 204 })); expect(await pending).toBe(false) })
    expect(useAuthStore.getState().session).not.toBeNull()
    if (action === 'new-session') expect(useAuthStore.getState().session?.accessToken).toBe('replacement-session')
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
  })
  it('leaves a wrong-current-password error recoverable without clearing the active session', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 401 })).mockResolvedValueOnce(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch)
    const { result } = renderCommand()
    await act(async () => { await result.current.run(input) }); expect(result.current.isUncertain).toBe(false); expect(useAuthStore.getState().session).not.toBeNull()
    await act(async () => { expect(await result.current.run(input)).toBe(true) })
  })
})
