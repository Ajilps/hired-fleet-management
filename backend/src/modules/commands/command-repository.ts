import { randomUUID } from 'node:crypto'
import { Prisma } from '../../generated/prisma/client.ts'
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { assertWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import type { CommandInput, CommandOutcome, CommandResponse } from './command-types.ts'
import { commandLockId } from './command-validation.ts'

export function createCommandRepository(transaction: WorkflowTransaction) {
  assertWorkflowTransaction(transaction)
  return {
    async tryLock(scope: { actorUserId: string; requestMethod: string; canonicalPath: string; idempotencyKey: string }) {
      const rows = await transaction.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(${commandLockId(scope)}::bigint) AS acquired`
      return rows[0]!.acquired
    },
    find(scope: { actorUserId: string; requestMethod: string; canonicalPath: string; idempotencyKey: string }) {
      return transaction.commandReplay.findUnique({ where: { actorUserId_requestMethod_canonicalPath_idempotencyKey: scope } })
    },
    removeExpired(id: string) { return transaction.commandReplay.delete({ where: { id } }) },
    async persist(actorUserId: string, input: CommandInput, fingerprint: string, outcome: CommandOutcome, response: CommandResponse) {
      const now = new Date()
      for (const event of outcome.audit) {
        await transaction.auditLog.create({ data: { actorUserId, entityType: event.entityType, entityId: event.entityId, action: event.action, requestId: input.requestId, beforeData: event.before ?? Prisma.DbNull, afterData: event.after ?? Prisma.DbNull, createdAt: now } })
      }
      await transaction.commandReplay.create({ data: {
        id: randomUUID(), actorUserId, requestMethod: input.method, canonicalPath: input.canonicalPath, idempotencyKey: input.key,
        requestFingerprint: fingerprint, outcome: outcome.outcome, responseStatus: response.status,
        responseBody: response.body === null ? Prisma.JsonNull : response.body, responseHeaders: response.headers ?? {}, createdAt: now, expiresAt: new Date(now.getTime() + 25 * 60 * 60 * 1000),
      } })
    },
  }
}
