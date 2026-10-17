import { act, render } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { it, expect, vi } from 'vitest'
import { AuthSessionMonitor } from './AuthSessionMonitor'
import { useAuthStore } from '../stores/use-auth-store'
import { createSessionResponse, createAdminSession } from '../../../test/auth-fixtures'
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
