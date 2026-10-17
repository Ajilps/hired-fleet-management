import { describe, expect, it, vi } from 'vitest'
import { changeOwnPassword } from './password-service'
import { signIn } from './auth-service'
import { createSessionResponse, TEST_EMAIL, TEST_PASSWORD } from '../../../test/auth-fixtures'

const input = { currentPassword: 'synthetic-current-password', newPassword: ' synthetic-new-password ' }
const signal = () => new AbortController().signal
describe('password transport and restricted identity', () => {
  it('posts only current/new password with browser guards, no replay headers and no cached credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch)
    await expect(changeOwnPassword('token', { ...input, confirmation: 'not-sent' } as typeof input, signal())).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith('/api/v1/users/me/password', expect.objectContaining({ method: 'POST', credentials: 'include', cache: 'no-store', body: JSON.stringify(input), headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Guard': '1' } }))
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Idempotency-Key')
  })
  it.each([200, 500, 503])('does not claim success for unexpected status %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ secret: 'not-shown' }, { status })))
    await expect(changeOwnPassword('token', input, signal())).rejects.toMatchObject({ isUncertain: true })
  })
  it.each([401, 403, 422])('keeps definitive failure %s recoverable without leaking server details', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { message: 'private-server-details' } }, { status })))
    await expect(changeOwnPassword('token', input, signal())).rejects.toMatchObject({ isUncertain: false })
  })
  it('marks lost responses uncertain and preserves explicit server retry guidance', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Response.json({ error: { retryAfterSeconds: 8 } }, { status: 429, headers: { 'Retry-After': '10' } })); vi.stubGlobal('fetch', fetch)
    await expect(changeOwnPassword('token', input, signal())).rejects.toMatchObject({ isUncertain: true })
    await expect(changeOwnPassword('token', input, signal())).rejects.toMatchObject({ isUncertain: false, retryAt: expect.any(Number) })
  })
  it('preserves the restriction flag without treating a restricted admin as a partner', async () => {
    const body = createSessionResponse(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...body, user: { ...body.user, passwordChangeRequired: true } })))
    expect((await signIn(TEST_EMAIL, TEST_PASSWORD)).user.passwordChangeRequired).toBe(true)
  })
  it('fails closed on malformed restriction metadata', async () => {
    const body = createSessionResponse(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...body, user: { ...body.user, passwordChangeRequired: 'false' } })))
    await expect(signIn(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow()
  })
})
