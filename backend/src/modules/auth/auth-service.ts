import { randomUUID } from 'node:crypto'
import { userDto } from './user-identity.ts'
import type { ScopedUser } from './user-identity.ts'
import type { AuthConfig } from './auth-config.ts'
import type { AuthRepository } from './auth-repository.ts'
import { hashPassword, verifyPassword } from './password-service.ts'
import { createRefreshToken, hashToken, signAccessToken, verifyAccessToken } from './token-service.ts'
import { parseRefreshToken } from './auth-validator.ts'
import { HttpError } from '../../shared/http/http-error.ts'

export async function createAuthService(repository: AuthRepository, config: AuthConfig) {
  const dummyHash = await hashPassword(randomUUID())
  async function issue(user: ScopedUser, sessionId: string, refreshToken: string, refreshExpiresAt: Date, transport: 'browser' | 'token') {
    const accessExpiresAt = new Date(Math.min(Date.now() + config.accessTtlSeconds * 1000, refreshExpiresAt.getTime()))
    return { body: {
      transport,
      accessToken: await signAccessToken(user.id, sessionId, accessExpiresAt, config), tokenType: 'Bearer',
      accessTokenExpiresAt: accessExpiresAt.toISOString(), refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
      sessionId, user: userDto(user), ...(transport === 'token' ? { refreshToken } : {}),
    }, refreshToken, refreshExpiresAt }
  }
  return {
    async login(input: { email: string; password: string; deviceName?: string; transport: 'browser' | 'token' }, ip: string) {
      await repository.consumeLimit(`login:ip:${ip}`, config.loginIpLimit, 900, config.key)
      await repository.consumeLimit(`login:account:${input.email}`, config.loginAccountLimit, 900, config.key)
      const user = await repository.findUser(input.email)
      const isCorrect = await verifyPassword(user?.passwordHash ?? dummyHash, input.password)
      if (!user?.isActive || !isCorrect) throw new HttpError(401, 'UNAUTHORIZED', 'The email or password is incorrect.')
      userDto(user)
      const sessionId = randomUUID()
      const refreshToken = createRefreshToken(sessionId)
      const expiresAt = new Date(Date.now() + config.refreshTtlSeconds * 1000)
      const created = await repository.createSession(user.passwordHash, { id: sessionId, userId: user.id, refreshTokenHash: hashToken(refreshToken), transport: input.transport, deviceName: input.deviceName ?? null, createdAt: new Date(), expiresAt })
      return issue(created.user, sessionId, refreshToken, expiresAt, input.transport)
    },
    async refresh(token: string, transport: 'browser' | 'token', ip: string) {
      await repository.consumeLimit(`refresh:ip:${ip}`, config.refreshIpLimit, 60, config.key)
      const { sessionId } = parseRefreshToken(token)
      const nextToken = createRefreshToken(sessionId)
      const session = await repository.rotate(sessionId, hashToken(token), hashToken(nextToken), transport)
      if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'The session is invalid or expired.')
      return issue(session.user, sessionId, nextToken, session.expiresAt, transport)
    },
    async authenticate(token: string) {
      const claims = await verifyAccessToken(token, config)
      const session = await repository.findSession(claims.sessionId)
      if (!session || session.userId !== claims.userId || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) throw new HttpError(401, 'UNAUTHORIZED', 'The session is invalid or expired.')
      userDto(session.user)
      return session
    },
    async changePassword(session: NonNullable<Awaited<ReturnType<AuthRepository['findSession']>>>, input: { currentPassword: string; newPassword: string }, ip: string, requestId: string) {
      await repository.consumeLimit(`password:ip:${ip}`, 30, 900, config.key)
      await repository.consumeLimit(`password:account:${session.userId}`, 5, 900, config.key)
      if (!await verifyPassword(session.user.passwordHash, input.currentPassword)) throw new HttpError(401, 'UNAUTHORIZED', 'The current password is incorrect.')
      const nextHash = await hashPassword(input.newPassword)
      await repository.changePassword(session.userId, session.id, session.user.passwordHash, nextHash, requestId)
    },
    revoke: repository.revokeSession,
    list: repository.listSessions,
  }
}
export type AuthService = Awaited<ReturnType<typeof createAuthService>>
