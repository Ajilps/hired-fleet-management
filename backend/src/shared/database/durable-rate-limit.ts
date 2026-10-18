import { createHmac } from 'node:crypto'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import { HttpError } from '../http/http-error.ts'

// Shared authenticated admission buckets retain the existing mapped table name.
// Call outside business transactions so rejection/rollback cannot erase attempts.
export async function consumeDurableLimit(client: PrismaClient, key: string, limit: number, windowSeconds: number, secret: Uint8Array) {
  const keyHash = createHmac('sha256', secret).update(key).digest('hex')
  const now = new Date(); const endsAt = new Date(now.getTime() + windowSeconds * 1000)
  const rows = await client.$queryRaw<{ attempts: number; window_ends_at: Date }[]>`
    INSERT INTO auth_rate_limits (key_hash, attempts, window_ends_at) VALUES (${keyHash}, 1, ${endsAt})
    ON CONFLICT (key_hash) DO UPDATE SET
      attempts = CASE WHEN auth_rate_limits.window_ends_at <= ${now} THEN 1 ELSE LEAST(auth_rate_limits.attempts + 1, ${limit + 1}) END,
      window_ends_at = CASE WHEN auth_rate_limits.window_ends_at <= ${now} THEN ${endsAt} ELSE auth_rate_limits.window_ends_at END
    RETURNING attempts, window_ends_at`
  if (rows[0]!.attempts > limit) throw new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.', Math.max(1, Math.ceil((rows[0]!.window_ends_at.getTime() - now.getTime()) / 1000)))
}
