import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { onlineManager, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from './use-auth'
import { AuthSessionMonitor } from '../components/AuthSessionMonitor'
import { useAuthStore } from '../stores/use-auth-store'
import { createAdminSession, createSessionResponse, TEST_EMAIL, TEST_PASSWORD } from '../../../test/auth-fixtures'
import { createTestQueryClient } from '../../../test/query-clients'

function renderAuthConsumers() {
  const queryClient = createTestQueryClient()
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}><AuthSessionMonitor />{children}</QueryClientProvider>
  }
  return {
    queryClient,
    ...renderHook(() => ({ first: useAuth(), second: useAuth() }), { wrapper: Wrapper }),
  }
}

describe('shared authentication state', () => {
  it('fails offline authentication without queuing credentials for later replay', async () => {
    onlineManager.setOnline(false)
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('synthetic offline failure'))
    vi.stubGlobal('fetch', fetchMock)
    const { result, queryClient } = renderAuthConsumers()
    await act(async () => {
      await expect(result.current.first.signIn(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow('Unable to connect.')
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.second.session).toBeNull()
    expect(result.current.second.isSigningIn).toBe(false)
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
  })

  it('synchronizes loading and session state across consumers and removes settled credentials', async () => {
    let completeRequest: (response: Response) => void = () => { throw new Error('Request not started') }
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => { completeRequest = resolve })))
    const { result, queryClient } = renderAuthConsumers()
    queryClient.setQueryData(['private', 'orders'], [{ id: 'previous-user-order' }])
    let pendingLogin = Promise.resolve()
    act(() => { pendingLogin = result.current.first.signIn(TEST_EMAIL, TEST_PASSWORD) })
    await waitFor(() => {
      expect(result.current.first.isSigningIn).toBe(true)
      expect(result.current.second.isSigningIn).toBe(true)
    })
    await act(async () => {
      completeRequest(Response.json(createSessionResponse()))
      await pendingLogin
    })
    expect(result.current.first.session).toBe(result.current.second.session)
    expect(result.current.second.session?.user.email).toBe(TEST_EMAIL)
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
    expect(localStorage.length + sessionStorage.length).toBe(0)
  })

  it('preserves the session and account cache after failed logout, then clears both on retry', async () => {
    useAuthStore.getState().establishSession(createAdminSession())
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: {} }, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const { result, queryClient } = renderAuthConsumers()
    queryClient.setQueryData(['private', 'orders'], [{ id: 'synthetic-order' }])
    await act(async () => {
      await expect(result.current.first.signOut()).rejects.toThrow('Sign out failed')
    })
    expect(result.current.second.session).not.toBeNull()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1)
    await act(async () => { await result.current.second.signOut() })
    expect(result.current.first.session).toBeNull()
    expect(result.current.second.session).toBeNull()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('expires the session, cancels private reads and removes cached records', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-16T04:00:00Z'))
    const session = createAdminSession()
    session.accessTokenExpiresAt = new Date(Date.now() + 1500).toISOString()
    useAuthStore.getState().establishSession(session)
    const { result, queryClient } = renderAuthConsumers()
    let activeSignal: AbortSignal | undefined
    void queryClient.fetchQuery({
      queryKey: ['private', 'pending-read'],
      queryFn: ({ signal }) => {
        activeSignal = signal
        return new Promise(() => {})
      },
    }).catch(() => undefined)
    queryClient.setQueryData(['private', 'orders'], [{ id: 'synthetic-order' }])
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    expect(result.current.first.session).toBeNull()
    expect(result.current.second.hasSessionExpired).toBe(true)
    expect(activeSignal?.aborted).toBe(true)
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })
})
