import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { assertWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import type { AuthConfig } from './auth-config.ts'
import { userDto, userScope } from './user-identity.ts'
import { verifyAccessToken } from './token-service.ts'

// Reauthenticate inside a command's transaction, with locks compatible with other reads.
export async function authenticateTransaction(transaction: WorkflowTransaction, token: string, config: AuthConfig, allowedRoles: readonly ('admin' | 'partner' | 'driver')[] = ['admin']) {
  assertWorkflowTransaction(transaction)
  const claims = await verifyAccessToken(token, config)
  await transaction.$queryRaw`SELECT id FROM users WHERE id = ${claims.userId}::uuid FOR SHARE`
  await transaction.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${claims.sessionId}::uuid FOR SHARE`
  await transaction.$queryRaw`SELECT user_id FROM company_users WHERE user_id = ${claims.userId}::uuid FOR SHARE`
  await transaction.$queryRaw`SELECT user_id FROM drivers WHERE user_id = ${claims.userId}::uuid FOR SHARE`
  const session = await transaction.authSession.findUnique({ where: { id: claims.sessionId }, include: { user: { include: userScope } } })
  if (!session || session.userId !== claims.userId || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) throw new HttpError(401, 'UNAUTHORIZED', 'The session is invalid or expired.')
  const identity = userDto(session.user)
  if (identity.passwordChangeRequired) throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your password before using business workflows.')
  if (!allowedRoles.includes(identity.role)) throw new HttpError(403, 'FORBIDDEN', 'This account cannot access the requested workflow.')
  return { userId: session.userId, sessionId: session.id, role: identity.role, companyId: identity.companyId, driverId: identity.driverId }
}
