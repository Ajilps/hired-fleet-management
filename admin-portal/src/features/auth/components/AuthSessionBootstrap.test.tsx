import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, vi, expect } from 'vitest'
import { AuthSessionBootstrap } from './AuthSessionBootstrap'
import { useAuthStore } from '../stores/use-auth-store'
import { createSessionResponse } from '../../../test/auth-fixtures'

describe('browser session restoration', () => {
  it('restores only the access session and does not retain refresh credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(createSessionResponse({ transport: 'browser' }))))
    render(<AuthSessionBootstrap><p>Workspace</p></AuthSessionBootstrap>)
    await screen.findByText('Workspace')
    expect(useAuthStore.getState().session?.isBrowserSession).toBe(true)
    expect(useAuthStore.getState().session).not.toHaveProperty('refreshToken')
  })
  it('does not resurrect an abandoned session after a newer logout', async () => {
    let release!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => { release = resolve })))
    render(<AuthSessionBootstrap><p>Workspace</p></AuthSessionBootstrap>)
    useAuthStore.getState().clearSession()
    release(Response.json(createSessionResponse({ transport: 'browser' })))
    await screen.findByText('Workspace')
    expect(useAuthStore.getState().session).toBeNull()
  })
  it('continues to sign-in after missing/expired refresh credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: {} }, { status: 401 })))
    render(<AuthSessionBootstrap><p>Sign-in form</p></AuthSessionBootstrap>)
    await waitFor(() => expect(screen.getByText('Sign-in form')).toBeVisible())
    expect(useAuthStore.getState().session).toBeNull()
  })
})
