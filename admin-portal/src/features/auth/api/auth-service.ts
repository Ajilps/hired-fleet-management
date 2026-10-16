import { SignInError } from '../errors/sign-in-error'
import type { AdminSession } from '../types/auth-types'
import { apiBaseUrl } from '../../../shared/api/api-client'

function getRetryAt(response: Response, retryAfterSeconds: unknown): number | null {
  const header = response.headers.get('Retry-After')
  if (header) {
    const seconds = Number(header)
    const retryAt = Number.isFinite(seconds)
      ? Date.now() + Math.max(0, seconds) * 1000
      : Date.parse(header)
    if (Number.isFinite(retryAt)) return retryAt
  }
  if (typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds)) {
    return Date.now() + Math.max(0, retryAfterSeconds) * 1000
  }
  return null
}

export async function signIn(email: string, password: string): Promise<AdminSession> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/v1/auth-sessions/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ email, password, deviceName: 'HireD admin portal' }),
    })
  } catch {
    throw new SignInError('Unable to connect. Check your connection and try again.')
  }
  const body = await response.json().catch(() => null)
  if (response.status === 429) {
    throw new SignInError('Too many attempts. Please wait before trying again.',
      getRetryAt(response, body?.error?.retryAfterSeconds))
  }
  if (response.status === 401) throw new SignInError('The email or password is incorrect.')
  if (response.status === 403) {
    throw new SignInError('Unable to sign in to the admin portal. Contact your administrator.')
  }
  if (response.status === 400 || response.status === 422) {
    throw new SignInError('Check your email and password and try again.')
  }
  if (!response.ok) throw new SignInError('Sign in is unavailable right now. Please try again.')
  if (
    typeof body?.accessToken !== 'string' || !body.accessToken || body.tokenType !== 'Bearer' ||
    typeof body.accessTokenExpiresAt !== 'string' ||
    !Number.isFinite(Date.parse(body.accessTokenExpiresAt)) ||
    Date.parse(body.accessTokenExpiresAt) <= Date.now() ||
    typeof body.user?.fullName !== 'string' || typeof body.user.email !== 'string'
  ) {
    throw new SignInError('Sign in could not be completed. Please try again.')
  }
  if (body.user.role !== 'admin' || body.user.isActive !== true) {
    await signOut(body.accessToken).catch(() => undefined)
    throw new SignInError('Unable to sign in to the admin portal. Contact your administrator.')
  }
  // Retain only the access session in memory, never the refresh token.
  return { accessToken: body.accessToken, accessTokenExpiresAt: body.accessTokenExpiresAt, user: body.user }
}

export async function signOut(accessToken: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth-sessions/logout`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok && response.status !== 401) throw new Error('Sign out failed')
}
