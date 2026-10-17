import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { assertWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import { accountSelect } from './account-mapper.ts'
import type { ListAccountsInput } from './account-validator.ts'
import type { AccountPosition } from './account-cursor.ts'

export function createAccountRepository(transaction: WorkflowTransaction) {
  assertWorkflowTransaction(transaction)
  async function find(id: string) {
    const user = await transaction.user.findUnique({ where: { id }, select: accountSelect })
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'Account not found.')
    return user
  }
  return {
    find,
    async lock(id: string) {
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`
      return find(id)
    },
    async list(input: ListAccountsInput, position: AccountPosition | undefined) {
      const role = input.role ?? null; const createdAt = position?.createdAt ?? null; const id = position?.id ?? null
      const roleValue = input.role === 'admin' ? 'Admin' : input.role === 'partner' ? 'Partner' : input.role === 'driver' ? 'Driver' : undefined
      const totalCount = await transaction.user.count({ where: roleValue ? { role: roleValue } : {} })
      // Preserve all six PostgreSQL timestamp digits in the anchor. JavaScript Date
      // would truncate legacy microseconds and skip or repeat directory rows.
      const rows = await transaction.$queryRaw<{ id: string; createdAt: string }[]>`
        SELECT id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
        FROM users WHERE (${role}::text IS NULL OR role::text = ${role})
          AND (${createdAt}::timestamptz IS NULL OR created_at < ${createdAt}::timestamptz OR (created_at = ${createdAt}::timestamptz AND id < ${id}::uuid))
        ORDER BY created_at DESC, id DESC LIMIT ${input.limit + 1}`
      const users = await transaction.user.findMany({ where: { id: { in: rows.map((row) => row.id) } }, select: accountSelect })
      const byId = new Map(users.map((user) => [user.id, user]))
      return { totalCount, items: rows.map((position) => ({ user: byId.get(position.id)!, position })) }
    },
    countUsableAdmins() { return transaction.user.count({ where: { role: 'Admin', isActive: true, passwordChangeRequired: false } }) },
    setStatus(id: string, isActive: boolean, updatedAt: Date) { return transaction.user.update({ where: { id }, data: { isActive, updatedAt }, select: accountSelect }) },
    revokeSessions(userId: string, revokedAt: Date) { return transaction.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt } }) },
  }
}
