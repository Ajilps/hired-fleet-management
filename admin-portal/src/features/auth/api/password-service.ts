import { apiBaseUrl } from '../../../shared/api/api-client'
import { withBrowserSessionLock } from './auth-service'
import { PasswordChangeError } from '../errors/password-change-error'

export async function changeOwnPassword(accessToken: string, input: { currentPassword: string; newPassword: string }, signal: AbortSignal) {
  return withBrowserSessionLock(async () => {
    let response: Response
    try {
      response = await fetch(`${apiBaseUrl}/api/v1/users/me/password`, { method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Guard': '1' },
        body: JSON.stringify({ currentPassword: input.currentPassword, newPassword: input.newPassword }), signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      })
    } catch { throw new PasswordChangeError('The password change could not be confirmed. Sign out and try signing in with your new password.', true) }
    if (response.status === 204) return
    if (response.status === 429) {
      const body = await response.json().catch(() => null)
      const seconds = response.headers.get('Retry-After')
      const fallback = body?.error?.retryAfterSeconds
      const delay = seconds && /^\d+$/.test(seconds) ? Number(seconds) : typeof fallback === 'number' ? fallback : 0
      const retryAt = Number.isFinite(delay) && delay > 0 ? Date.now() + delay * 1000 : null
      throw new PasswordChangeError('Too many attempts. Wait before trying again.', false, retryAt)
    }
    if (response.status === 401) throw new PasswordChangeError('The current password or session is invalid. Check the password, or sign out and sign in again.')
    if (response.status === 403) throw new PasswordChangeError('This password change is unavailable. Sign out and sign in again.')
    if (response.status === 400 || response.status === 422) throw new PasswordChangeError('Check your passwords and try again.')
    throw new PasswordChangeError('The password change could not be confirmed. Sign out and try signing in with your new password.', true)
  })
}
