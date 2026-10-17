import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createSessionResponse, TEST_EMAIL, TEST_PASSWORD } from '../../../test/auth-fixtures'
import { useAuthStore } from '../stores/use-auth-store'
import { renderApp as renderLogin } from '../../../test/render-app'

describe('admin login interactions', () => {
  it('focuses and describes invalid fields without sending a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { user } = renderLogin()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByLabelText('Email address')).toHaveFocus()
    expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription('Enter your email address.')
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAccessibleDescription('Enter your password.')
    await user.type(screen.getByLabelText('Email address'), 'invalid-email')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Enter a valid email address.')).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('toggles password visibility using an accessible button', async () => {
    const { user } = renderLogin()
    const password = screen.getByLabelText('Password', { exact: true })
    await user.type(password, TEST_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveValue(TEST_PASSWORD)
  })

  it('submits by keyboard and preserves input after invalid credentials without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: {} }, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const { user, queryClient } = renderLogin()
    await user.type(screen.getByLabelText('Email address'), TEST_EMAIL)
    await user.type(screen.getByLabelText('Password', { exact: true }), `${TEST_PASSWORD}{Enter}`)
    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.')
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue(TEST_PASSWORD)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
  })

  it('disables duplicate submissions until the request completes', async () => {
    let completeRequest: (response: Response) => void = () => { throw new Error('Request not started') }
    const pendingLogin = new Promise<Response>((resolve) => { completeRequest = resolve })
    const fetchMock = vi.fn().mockImplementation((url: string) => url.endsWith('/users/me')
      ? Promise.resolve(Response.json(createSessionResponse().user)) : pendingLogin)
    vi.stubGlobal('fetch', fetchMock)
    const { user } = renderLogin()
    await user.type(screen.getByLabelText('Email address'), TEST_EMAIL)
    await user.type(screen.getByLabelText('Password', { exact: true }), TEST_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const pendingButton = await screen.findByRole('button', { name: 'Signing in…' })
    expect(pendingButton).toBeDisabled()
    await user.click(pendingButton)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    completeRequest(Response.json(createSessionResponse()))
    expect(await screen.findByRole('heading', { name: 'Operations overview' })).toBeVisible()
  })

  it('clears credentials and cached account data after login and successful logout', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/auth-sessions/login')) return Promise.resolve(Response.json(createSessionResponse()))
      if (url.endsWith('/users/me')) return Promise.resolve(Response.json(createSessionResponse().user))
      if (url.endsWith('/auth-sessions/logout')) return Promise.resolve(new Response(null, { status: 204 }))
      return Promise.resolve(Response.json({ items: [], pageInfo: { totalCount: 0, hasMore: false, nextCursor: null } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { user, queryClient } = renderLogin()
    queryClient.setQueryData(['private', 'orders'], [{ id: 'synthetic-order' }])
    await user.type(screen.getByLabelText('Email address'), TEST_EMAIL)
    await user.type(screen.getByLabelText('Password', { exact: true }), TEST_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('heading', { name: 'Operations overview' })
    expect(queryClient.getQueryData(['private', 'orders'])).toBeUndefined()
    expect(useAuthStore.getState().session).not.toHaveProperty('refreshToken')
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
    queryClient.setQueryData(['private', 'orders'], [{ id: 'synthetic-order' }])
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('heading', { name: 'Welcome back' })
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('')
    expect(useAuthStore.getState().session).toBeNull()
    expect(queryClient.getQueryData(['private', 'orders'])).toBeUndefined()
    expect(queryClient.getQueryCache().getAll().every((query) => query.state.data === undefined)).toBe(true)
    expect(localStorage.length + sessionStorage.length).toBe(0)
  })
})
