import type { AdminSession } from '../types/auth-types'

export function isAdminSessionActive(session: AdminSession | null): session is AdminSession {
  return Boolean(session?.accessToken && session.user.role === 'admin' && session.user.isActive === true &&
    Date.parse(session.accessTokenExpiresAt) > Date.now())
}
