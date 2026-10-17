import { act, screen, waitFor } from '@testing-library/react'
import { onlineManager } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../features/auth'
import { ApiError } from '../shared/api/api-client'
import { createAdminSession, createSessionResponse } from '../test/auth-fixtures'
import { renderApp } from '../test/render-app'

function establishSession() {
  useAuthStore.getState().establishSession(createAdminSession())
}

describe('protected admin routing', () => {
  it.each(['/overview', '/orders', '/does-not-exist'])('redirects signed-out access to %s without fetching private data', async (path) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderApp(path)
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible()
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('waits for the authoritative current-admin response before revealing the workspace', async () => {
    establishSession()
    let completeRequest!: (response: Response) => void
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { completeRequest = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    renderApp('/orders')
    expect(screen.getByRole('heading', { name: 'Checking your session…' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Orders' })).not.toBeInTheDocument()
    await act(async () => completeRequest(Response.json(createSessionResponse().user)))
    expect(await screen.findByRole('heading', { name: 'Orders' })).toBeVisible()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/users/me', expect.objectContaining({
      headers: { Accept: 'application/json', Authorization: 'Bearer synthetic-access-token' },
      credentials: 'omit', cache: 'no-store', signal: expect.any(AbortSignal),
    }))
  })

  it.each(['/', '/login'])('sends a verified signed-in admin from %s to the overview', async (path) => {
    establishSession()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(createSessionResponse().user)))
    renderApp(path)
    expect(await screen.findByRole('heading', { name: 'Operations overview' })).toBeVisible()
    expect(screen.getByRole('main')).toHaveFocus()
    await waitFor(() => expect(document.title).toBe('Overview | HireD Admin'))
  })

  it.each([401, 403])('ends the session when current-user verification returns %s', async (status) => {
    establishSession()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status })))
    const { queryClient } = renderApp('/overview')
    queryClient.setQueryData(['private', 'orders'], ['synthetic-order'])
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible()
    expect(screen.getByText('Your session expired', { exact: true })).toBeVisible()
    expect(useAuthStore.getState().session).toBeNull()
    expect(queryClient.getQueryData(['private', 'orders'])).toBeUndefined()
  })

  it.each([{ role: 'driver' }, { isActive: false }])('rejects a revoked or non-admin account: %j', async (overrides) => {
    establishSession()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...createSessionResponse().user, ...overrides })))
    renderApp('/overview')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible()
    expect(useAuthStore.getState().session).toBeNull()
  })

  it('preserves a recoverable verification failure and retries only on request', async () => {
    establishSession()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json(createSessionResponse().user))
    vi.stubGlobal('fetch', fetchMock)
    const { user } = renderApp('/trips')
    expect(await screen.findByRole('heading', { name: 'We couldn’t verify your session' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Trips' })).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().session).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Trips' })).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shows a connection error instead of leaving offline verification paused indefinitely', async () => {
    establishSession()
    onlineManager.setOnline(false)
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Synthetic offline failure'))
    vi.stubGlobal('fetch', fetchMock)
    renderApp('/overview')
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(useAuthStore.getState().session).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('navigates between sections with an active link, title and focus', async () => {
    establishSession()
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json(createSessionResponse().user))))
    const { user } = renderApp('/overview')
    await screen.findByRole('heading', { name: 'Operations overview' })
    await user.click(screen.getByRole('link', { name: 'Monthly statements' }))
    expect(screen.getByRole('heading', { name: 'Monthly statements' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Monthly statements' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('main')).toHaveFocus()
    expect(document.title).toBe('Monthly statements | HireD Admin')
  })

  it('shows a protected not-found page with a working return link', async () => {
    establishSession()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(createSessionResponse().user)))
    const { user } = renderApp('/missing')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible()
    await user.click(screen.getByRole('link', { name: 'Back to overview' }))
    expect(await screen.findByRole('heading', { name: 'Operations overview' })).toBeVisible()
  })

  it.each(['query', 'mutation'] as const)('clears private data and redirects after an authenticated %s returns 401', async (kind) => {
    establishSession()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(createSessionResponse().user)))
    const { queryClient } = renderApp('/overview')
    await screen.findByRole('heading', { name: 'Operations overview' })
    queryClient.setQueryData(['private', 'orders'], ['synthetic-order'])
    await act(async () => {
      const failure = () => Promise.reject(new ApiError(401, 'Sign in again.'))
      const request = kind === 'query'
        ? queryClient.fetchQuery({ queryKey: ['private', 'test'], queryFn: failure })
        : queryClient.getMutationCache().build(queryClient, { mutationFn: failure }).execute(undefined)
      await request.catch(() => undefined)
    })
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible()
    expect(queryClient.getQueryData(['private', 'orders'])).toBeUndefined()
  })

  it('keeps a verified session on a resource-specific 403', async () => {
    establishSession()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(createSessionResponse().user)))
    const { queryClient } = renderApp('/overview')
    await screen.findByRole('heading', { name: 'Operations overview' })
    await act(async () => {
      await queryClient.fetchQuery({ queryKey: ['private', 'denied'], queryFn: () => Promise.reject(new ApiError(403, 'No access.')) }).catch(() => undefined)
    })
    await waitFor(() => expect(useAuthStore.getState().session).not.toBeNull())
    expect(screen.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  })
})
