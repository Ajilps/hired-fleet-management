import { createHmac } from 'node:crypto'
import type { PrismaClient, Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../shared/http/http-error.ts'

export function createAuthRepository(client: PrismaClient) {
  return {
    createAdmin(data: Prisma.UserUncheckedCreateInput) { return client.user.create({ data }) },
    findUser(email: string) { return client.user.findUnique({ where: { email } }) },
    async createSession(data: Prisma.AuthSessionUncheckedCreateInput) {
      return client.$transaction(async (transaction) => {
        // Serialize with account status changes; recheck after expensive password verification.
        await transaction.$queryRaw`SELECT id FROM users WHERE id = ${data.userId}::uuid FOR UPDATE`
        const user = await transaction.user.findUnique({ where: { id: data.userId } })
        if (!user?.isActive || user.role !== 'Admin') throw new HttpError(401, 'UNAUTHORIZED', 'The email or password is incorrect.')
        const session = await transaction.authSession.create({ data })
        await transaction.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
        return { session, user }
      })
    },
    async rotate(sessionId: string, tokenHash: string, nextHash: string, transport: 'browser' | 'token') {
      return client.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`
        const session = await transaction.authSession.findUnique({ where: { id: sessionId }, include: { user: true } })
        if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive || session.transport !== transport || session.user.role !== 'Admin') return null
        if (session.refreshTokenHash !== tokenHash) {
          const reused = await transaction.authRefreshToken.findUnique({ where: { tokenHash } })
          if (reused?.sessionId === sessionId) await transaction.authSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
          return null // Return, rather than throw, so replay revocation commits.
        }
        await transaction.authRefreshToken.create({ data: { tokenHash, sessionId, consumedAt: new Date() } })
        await transaction.authSession.update({ where: { id: sessionId }, data: { refreshTokenHash: nextHash } })
        return session
      })
    },
    findSession(sessionId: string) { return client.authSession.findUnique({ where: { id: sessionId }, include: { user: true } }) },
    revokeSession(sessionId: string, userId: string) { return client.authSession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } }) },
    async listSessions(userId: string, limit: number, cursor: string | undefined) {
      const where = { userId, revokedAt: null, expiresAt: { gt: new Date() } }
      // A single repeatable-read snapshot keeps total and page membership consistent.
      return client.$transaction(async (transaction) => {
        const totalCount = await transaction.authSession.count({ where })
        const anchor = cursor ? await transaction.authSession.findFirst({ where: { ...where, id: cursor } }) : null
        if (cursor && !anchor) throw new HttpError(422, 'VALIDATION_FAILED', 'Invalid session cursor.')
        const items = await transaction.authSession.findMany({ where: anchor ? { ...where, OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] } : where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 })
        return { items, totalCount }
      }, { isolationLevel: 'RepeatableRead' })
    },
    async consumeLimit(key: string, limit: number, windowSeconds: number, secret: Uint8Array) {
      const keyHash = createHmac('sha256', secret).update(key).digest('hex')
      const now = new Date()
      const endsAt = new Date(now.getTime() + windowSeconds * 1000)
      const rows = await client.$queryRaw<{ attempts: number; window_ends_at: Date }[]>`
        INSERT INTO auth_rate_limits (key_hash, attempts, window_ends_at) VALUES (${keyHash}, 1, ${endsAt})
        ON CONFLICT (key_hash) DO UPDATE SET
          attempts = CASE WHEN auth_rate_limits.window_ends_at <= ${now} THEN 1 ELSE LEAST(auth_rate_limits.attempts + 1, ${limit + 1}) END,
          window_ends_at = CASE WHEN auth_rate_limits.window_ends_at <= ${now} THEN ${endsAt} ELSE auth_rate_limits.window_ends_at END
        RETURNING attempts, window_ends_at`
      if (rows[0]!.attempts > limit) throw new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.', Math.max(1, Math.ceil((rows[0]!.window_ends_at.getTime() - now.getTime()) / 1000)))
    },
  }
}
export type AuthRepository = ReturnType<typeof createAuthRepository>
