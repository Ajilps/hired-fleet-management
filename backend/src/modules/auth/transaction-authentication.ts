import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { assertWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import type { AuthConfig } from './auth-config.ts'
import { verifyAccessToken } from './token-service.ts'

// Reauthenticate inside a command's transaction, with locks compatible with other reads.
export async function authenticateTransaction(transaction: WorkflowTransaction, token: string, config: AuthConfig) {
  assertWorkflowTransaction(transaction)
  const claims = await verifyAccessToken(token, config)
  await transaction.$queryRaw`SELECT id FROM users WHERE id = ${claims.userId}::uuid FOR SHARE`
  await transaction.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${claims.sessionId}::uuid FOR SHARE`
  const session = await transaction.authSession.findUnique({ where: { id: claims.sessionId }, include: { user: true } })
  if (!session || session.userId !== claims.userId || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) throw new HttpError(401, 'UNAUTHORIZED', 'The session is invalid or expired.')
  if (session.user.role !== 'Admin') throw new HttpError(403, 'FORBIDDEN', 'Admin access is required.')
  return { userId: session.userId, sessionId: session.id, role: 'admin' as const }
}
