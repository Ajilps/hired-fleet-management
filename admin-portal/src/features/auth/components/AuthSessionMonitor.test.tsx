import { act, render, renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { it, expect, vi } from 'vitest'
import { AuthSessionMonitor } from './AuthSessionMonitor'
import { useAuthStore } from '../stores/use-auth-store'
import { createSessionResponse, createAdminSession } from '../../../test/auth-fixtures'
import type { ReactNode } from 'react'
import { useChangePassword } from '../hooks/use-change-password'
import { createTestQueryClient } from '../../../test/query-clients'

it('renews browser access before expiry without persisting refresh credentials', async () => {
  vi.useFakeTimers()
  const now = Date.now()
  useAuthStore.getState().establishSession({ ...createAdminSession(), isBrowserSession: true, accessTokenExpiresAt: new Date(now + 35_000).toISOString() })
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json(createSessionResponse({ transport: 'browser', accessToken: 'renewed-access', accessTokenExpiresAt: new Date(Date.now() + 120_000).toISOString() })))))
  render(<QueryClientProvider client={createTestQueryClient()}><AuthSessionMonitor /></QueryClientProvider>)
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(useAuthStore.getState().session?.accessToken).toBe('renewed-access')
  expect(useAuthStore.getState().session).not.toHaveProperty('refreshToken')
})

it('suspends pre-expiry renewal while a password change owns the browser credential transition', async () => {
  vi.useFakeTimers()
  useAuthStore.getState().establishSession({ ...createAdminSession(), isBrowserSession: true, accessTokenExpiresAt: new Date(Date.now() + 35_000).toISOString() })
  let complete!: (response: Response) => void
  const fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { complete = resolve })); vi.stubGlobal('fetch', fetch)
  const client = createTestQueryClient()
  function Wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}><AuthSessionMonitor />{children}</QueryClientProvider> }
  const { result } = renderHook(() => useChangePassword(), { wrapper: Wrapper })
  let pending!: ReturnType<typeof result.current.run>
  await act(async () => { pending = result.current.run({ currentPassword: 'synthetic-current-password', newPassword: 'synthetic-new-password' }); await vi.advanceTimersByTimeAsync(0) })
  await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][0]).toBe('/api/v1/users/me/password')
  await act(async () => { complete(new Response(null, { status: 204 })); expect(await pending).toBe(true) })
  expect(useAuthStore.getState().session).toBeNull()
})
