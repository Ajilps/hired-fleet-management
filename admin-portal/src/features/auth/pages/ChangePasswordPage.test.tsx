import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/use-auth-store'
import { createAdminSession, createSessionResponse } from '../../../test/auth-fixtures'
import { renderApp } from '../../../test/render-app'

const currentPassword = 'synthetic-current-password'; const newPassword = 'synthetic-new-password'
function setup(path = '/overview', fromIdentity = false) {
  const session = createAdminSession(); session.user.passwordChangeRequired = !fromIdentity
  useAuthStore.getState().establishSession(session)
  const fetch = vi.fn().mockImplementation((url: string) => {
    if (url.endsWith('/users/me')) return Promise.resolve(Response.json({ ...createSessionResponse().user, passwordChangeRequired: true }))
    if (url.endsWith('/users/me/password')) return Promise.resolve(new Response(null, { status: 204 }))
    return Promise.resolve(Response.json({ error: {} }, { status: 404 }))
  }); vi.stubGlobal('fetch', fetch)
  return { fetch, ...renderApp(path) }
}
describe('admin first-login password route', () => {
  it.each(['/login', '/overview', '/orders', '/change-password'])('gates %s on password change without loading business data', async (path) => {
    const { fetch } = setup(path)
    expect(await screen.findByRole('heading', { name: 'Change your password' })).toBeVisible()
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    expect(fetch.mock.calls.every(([url]) => String(url).endsWith('/users/me'))).toBe(true)
  })
  it('honors a current-server restriction even if an older in-memory session lacks it', async () => {
    setup('/orders', true)
    expect(await screen.findByRole('heading', { name: 'Change your password' })).toBeVisible()
  })
  it('validates, masks input, clears credentials/private caches and requires fresh login after success', async () => {
    const { user, queryClient, fetch } = setup(); queryClient.setQueryData(['private'], ['synthetic-record'])
    await screen.findByRole('heading', { name: 'Change your password' })
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.getByLabelText('Current password', { exact: true })).toHaveFocus()
    await user.type(screen.getByLabelText('Current password', { exact: true }), currentPassword)
    await user.type(screen.getByLabelText('New password', { exact: true }), newPassword)
    await user.type(screen.getByLabelText('Confirm new password', { exact: true }), 'mismatched')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.getByText('The new passwords must match.')).toBeVisible()
    await user.clear(screen.getByLabelText('Confirm new password', { exact: true })); await user.type(screen.getByLabelText('Confirm new password', { exact: true }), newPassword)
    expect(screen.getByLabelText('New password', { exact: true })).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show passwords' })); expect(screen.getByLabelText('New password', { exact: true })).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible(); expect(screen.getByText('Password updated')).toBeVisible()
    expect(queryClient.getQueryData(['private'])).toBeUndefined(); expect(useAuthStore.getState().session).toBeNull()
    expect(fetch.mock.calls.find(([url]) => String(url).endsWith('/users/me/password'))?.[1].body).toBe(JSON.stringify({ currentPassword, newPassword }))
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0))
  })
})
