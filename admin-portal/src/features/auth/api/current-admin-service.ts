import { ApiError, requestAuthenticatedJson } from '../../../shared/api/api-client'
import type { AdminSession } from '../types/auth-types'

export async function getCurrentAdmin(accessToken: string, signal: AbortSignal): Promise<AdminSession['user']> {
  let response: unknown
  try {
    response = await requestAuthenticatedJson('/api/v1/users/me', { accessToken, signal })
  } catch (error) {
    // This endpoint verifies account access, so its denial ends the admin session.
    if (error instanceof ApiError && error.status === 403) throw new ApiError(401, 'Sign in again to continue.')
    throw error
  }
  if (!response || typeof response !== 'object') throw new ApiError(502, 'Unable to verify your account. Please try again.')
  const user = response as Record<string, unknown>
  if (user.role !== 'admin' || user.isActive !== true) throw new ApiError(401, 'Sign in again to continue.')
  if (typeof user.fullName !== 'string' || typeof user.email !== 'string' || (user.passwordChangeRequired !== undefined && typeof user.passwordChangeRequired !== 'boolean')) {
    throw new ApiError(502, 'Unable to verify your account. Please try again.')
  }
  return { role: 'admin', isActive: true, fullName: user.fullName, email: user.email, ...(typeof user.passwordChangeRequired === 'boolean' ? { passwordChangeRequired: user.passwordChangeRequired } : {}) }
}
