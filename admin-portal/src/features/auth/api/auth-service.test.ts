import { describe, expect, it, vi } from 'vitest'
import { signIn, signOut } from './auth-service'
import { SignInError } from '../errors/sign-in-error'
import { createSessionResponse, TEST_EMAIL, TEST_PASSWORD } from '../../../test/auth-fixtures'

function mockResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...headers },
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('authentication API contract', () => {
  it('posts the documented payload and retains only the access session', async () => {
    const response = createSessionResponse()
    const fetchMock = mockResponse(response)
    const session = await signIn(TEST_EMAIL, TEST_PASSWORD)

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/auth-sessions/login')
    expect(options).toMatchObject({ method: 'POST', credentials: 'include', cache: 'no-store' })
    expect(JSON.parse(options.body)).toEqual({
      email: TEST_EMAIL, password: TEST_PASSWORD, deviceName: 'HireD admin portal', transport: 'browser',
    })
    expect(session.accessToken).toBe(response.accessToken)
    expect(session).not.toHaveProperty('refreshToken')
    expect(session).not.toHaveProperty('password')
  })

  it('uses generic invalid-credential feedback without exposing server details', async () => {
    mockResponse({ error: { message: 'synthetic account detail' } }, 401)
    await expect(signIn(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow('The email or password is incorrect.')
  })

  it.each([
    ['partner', true], ['driver', true], ['admin', false],
  ])('rejects role %s with active state %s and revokes the issued session', async (role, isActive) => {
    const body = createSessionResponse({ user: { role, isActive, fullName: 'Test User', email: TEST_EMAIL } })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(body))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(signIn(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow('Unable to sign in to the admin portal.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth-sessions/logout')
  })

  it.each([
    {},
    createSessionResponse({ accessToken: '' }),
    createSessionResponse({ tokenType: 'invalid' }),
    createSessionResponse({ accessTokenExpiresAt: 'invalid' }),
    createSessionResponse({ accessTokenExpiresAt: '2020-01-01T00:00:00Z' }),
  ])('rejects malformed or expired successful responses', async (body) => {
    mockResponse(body)
    await expect(signIn(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow('Sign in could not be completed.')
  })

  it.each(['seconds', 'date', 'body'])('respects the server retry delay supplied as %s', async (format) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-16T04:00:00Z'))
    const delaySeconds = 30
    const headers: Record<string, string> = format === 'seconds' ? { 'Retry-After': '30' }
      : format === 'date' ? { 'Retry-After': new Date(Date.now() + 30_000).toUTCString() } : {}
    mockResponse({ error: { retryAfterSeconds: format === 'body' ? delaySeconds : 90 } }, 429, headers)

    await expect(signIn(TEST_EMAIL, TEST_PASSWORD)).rejects.toMatchObject({ retryAt: Date.now() + 30_000 })
  })

  it('does not invent a retry delay if the server provides none', async () => {
    mockResponse({ error: { retryAfterSeconds: null } }, 429)
    await expect(signIn(TEST_EMAIL, TEST_PASSWORD)).rejects.toMatchObject({ retryAt: null })
  })

  it('rejects an HTML fallback page instead of treating it as a session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html><title>Portal</title>')))
    await expect(signIn(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow('Sign in could not be completed.')
  })

  it('turns connection failures into recoverable feedback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('synthetic network failure')))
    await expect(signIn(TEST_EMAIL, TEST_PASSWORD)).rejects.toBeInstanceOf(SignInError)
    await expect(signIn(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow('Unable to connect.')
  })

  it('treats an already revoked session as signed out', async () => {
    const fetchMock = mockResponse({ error: {} }, 401)
    await expect(signOut('synthetic-access-token')).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer synthetic-access-token', 'X-CSRF-Guard': '1' })
  })

  it('keeps failed logout retryable', async () => {
    mockResponse({ error: {} }, 503)
    await expect(signOut('synthetic-access-token')).rejects.toThrow('Sign out failed')
  })
})
