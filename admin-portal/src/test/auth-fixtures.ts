export const TEST_EMAIL = 'admin@example.test'
export const TEST_PASSWORD = 'synthetic-test-password'

export function createSessionResponse(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: 'synthetic-access-token',
    tokenType: 'Bearer',
    accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    refreshToken: 'synthetic-refresh-token',
    refreshTokenExpiresAt: new Date(Date.now() + 120_000).toISOString(),
    sessionId: '22222222-2222-4222-8222-222222222222',
    user: {
      role: 'admin', fullName: 'Test Admin', email: TEST_EMAIL, isActive: true,
    },
    ...overrides,
  }
}
import type { AdminSession } from '../features/auth'


export function createAdminSession(): AdminSession {
  const { accessToken, accessTokenExpiresAt, user } = createSessionResponse()
  return { accessToken, accessTokenExpiresAt, user: { ...user, role: 'admin', isActive: true } }
}
