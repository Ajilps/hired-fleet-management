import { Router } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { Prisma } from '../../generated/prisma/client.ts'
import type { PrismaClient, Notification } from '../../generated/prisma/client.ts'
import type { AuthConfig } from '../auth/index.ts'
import { authenticateTransaction } from '../auth/index.ts'
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { createCommandExecutor } from '../commands/index.ts'
import { createCompanyCursor } from '../companies/company-cursor.ts'
import { bearer, identity, sendCommand } from '../orders/order-controller.ts'
import { parse, idSchema, pageSchema } from '../orders/order-validator.ts'
import { HttpError } from '../../shared/http/http-error.ts'
const notificationList = pageSchema.extend({ status: z.enum(['pending','processing','sent','failed']).optional(), companyIds: z.union([idSchema, z.array(idSchema).min(1).max(100)]).transform(value => [...new Set(Array.isArray(value) ? value : [value])].sort()).optional() })
const timestamp = z.iso.datetime({ offset: true })
const auditList = pageSchema.extend({ entityType: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/).optional(), entityId: idSchema.optional(), actorUserId: idSchema.optional(), createdFrom: timestamp.optional(), createdTo: timestamp.optional() }).refine(value => !value.createdFrom || !value.createdTo || new Date(value.createdFrom) < new Date(value.createdTo))
export function notificationDto(row: Notification) { return { id: row.id, companyId: row.companyId, userId: row.userId, orderId: row.orderId, statementId: row.statementId, eventType: row.eventType, channel: row.channel, status: row.status, recipientEmail: row.recipientEmail, attemptCount: row.attemptCount, nextAttemptAt: row.nextAttemptAt.toISOString(), lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null, sentAt: row.sentAt?.toISOString() ?? null, failureReason: row.failureReason, createdAt: row.createdAt.toISOString() } }
export function createNotificationRouter(client: PrismaClient, auth: AuthConfig, key: Uint8Array) {
 const router = Router(); const cursor = createCompanyCursor(key); const execute = createCommandExecutor(client, { auth, fingerprintKey: key })
 const read = <T>(token: string, run: (tx: import('../../shared/database/workflow-transaction.ts').WorkflowTransaction, actor: Awaited<ReturnType<typeof authenticateTransaction>>) => Promise<T>) => client.$transaction(tx => withWorkflowTransaction(tx, async context => run(context, await authenticateTransaction(context, token, auth))), { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 })
 const missing = () => new HttpError(404, 'NOT_FOUND', 'Notification not found.')
 router.get('/notifications', async (req, res) => {
  const input = parse(notificationList, req.query)
  res.json(await read(bearer(req), async (tx, actor) => {
   const filter = JSON.stringify(['notifications', actor.userId, input.status, input.companyIds]); const anchor = cursor.decode(filter, input.cursor)
   const where = { ...(input.status ? { status: input.status } : {}), ...(input.companyIds ? { companyId: { in: input.companyIds } } : {}) }
   const totalCount = await tx.notification.count({ where })
   const rows = await tx.notification.findMany({ where: { AND: [where, anchor ? { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 })
   const items = rows.slice(0, input.limit); const hasMore = rows.length > input.limit
   return { items: items.map(notificationDto), pageInfo: { totalCount, hasMore, nextCursor: hasMore ? cursor.encode(filter, items.at(-1)!) : null } }
  }))
 })
 router.get('/notifications/:notificationId', async (req, res) => {
  const id = parse(idSchema, req.params.notificationId)
  res.json(await read(bearer(req), async tx => { const row = await tx.notification.findUnique({ where: { id } }); if (!row) throw missing(); return notificationDto(row) }))
 })
 router.post('/notifications/:notificationId/retry', async (req, res) => {
  const id = parse(idSchema, req.params.notificationId)
  if (req.body !== undefined) parse(z.strictObject({}), req.body)
  sendCommand(res, await execute({ ...identity(req, res), method: 'POST', canonicalPath: `/api/v1/notifications/${id}/retry`, request: {}, authorize: async tx => { if (!await tx.notification.findUnique({ where: { id } })) throw missing() }, async execute(tx) {
   await tx.$queryRaw`SELECT id FROM notifications WHERE id = ${id}::uuid FOR UPDATE`
   const row = await tx.notification.findUniqueOrThrow({ where: { id } })
   if (row.status !== 'failed') throw new HttpError(409, 'NOTIFICATION_NOT_FAILED', 'Only failed intents may be retried.')
   if (!row.recipientEmail) throw new HttpError(409, 'RECIPIENT_MISSING', 'The captured recipient is missing; this intent cannot be delivered.')
   const now = (await tx.$queryRaw<{ now: Date }[]>`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`)[0]!.now
   const after = await tx.notification.update({ where: { id }, data: { status: 'pending', attemptCycleStart: row.attemptCount, nextAttemptAt: now, failureReason: null, updatedAt: now } })
   return { outcome: 'succeeded', response: { status: 200, body: notificationDto(after) }, audit: [{ entityType: 'notification', entityId: id, action: 'notification.retried', before: { status: row.status, attemptCount: row.attemptCount }, after: { status: after.status, attemptCount: after.attemptCount } }] }
  } }))
 })
 // Audit anchors preserve all six database timestamp digits and bigint IDs.
 const sign = (value: string) => createHmac('sha256', key).update('hired-audit-cursor-v1\0').update(value).digest()
 const anchorSchema = z.strictObject({ scope: z.string(), createdAt: z.iso.datetime({ precision: 6 }), id: z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value => BigInt(value) <= 9_223_372_036_854_775_807n) })
 router.get('/audit-logs', async (req, res) => {
  const input = parse(auditList, req.query)
  res.json(await read(bearer(req), async (tx, actor) => {
   const scope = JSON.stringify([actor.userId, input.entityType, input.entityId, input.actorUserId, input.createdFrom, input.createdTo])
   let anchor: z.infer<typeof anchorSchema> | undefined
   if (input.cursor) {
    try {
     const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(input.cursor)
     if (!match || !timingSafeEqual(sign(match[1]!), Buffer.from(match[2]!, 'base64url')) || Buffer.from(match[1]!, 'base64url').toString('base64url') !== match[1] || Buffer.from(match[2]!, 'base64url').toString('base64url') !== match[2]) throw new Error('Invalid cursor')
     anchor = anchorSchema.parse(JSON.parse(Buffer.from(match[1]!, 'base64url').toString('utf8')))
     if (anchor.scope !== scope) throw new Error('Invalid scope')
    } catch { throw new HttpError(422, 'VALIDATION_FAILED', 'The audit cursor is invalid for this request.') }
   }
   const clauses = [Prisma.sql`TRUE`]
   if (input.entityType) clauses.push(Prisma.sql`entity_type = ${input.entityType}`)
   if (input.entityId) clauses.push(Prisma.sql`entity_id = ${input.entityId}::uuid`)
   if (input.actorUserId) clauses.push(Prisma.sql`actor_user_id = ${input.actorUserId}::uuid`)
   if (input.createdFrom) clauses.push(Prisma.sql`created_at >= ${input.createdFrom}::timestamptz`)
   if (input.createdTo) clauses.push(Prisma.sql`created_at < ${input.createdTo}::timestamptz`)
   const where = Prisma.join(clauses, ' AND ')
   const count = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM audit_logs WHERE ${where}`)
   type Audit = { id: string; actorUserId: string | null; entityType: string; entityId: string; action: string; requestId: string | null; createdAt: string }
   const rows = await tx.$queryRaw<Audit[]>(Prisma.sql`SELECT id::text, actor_user_id AS "actorUserId", entity_type AS "entityType", entity_id AS "entityId", action, request_id AS "requestId", to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt" FROM audit_logs WHERE ${where} ${anchor ? Prisma.sql`AND (created_at, id) < (${anchor.createdAt}::timestamptz, ${BigInt(anchor.id)})` : Prisma.empty} ORDER BY created_at DESC, id DESC LIMIT ${input.limit + 1}`)
   const items = rows.slice(0, input.limit); const hasMore = rows.length > input.limit; const last = items.at(-1)
   const payload = last ? Buffer.from(JSON.stringify({ scope, createdAt: last.createdAt, id: last.id })).toString('base64url') : ''
   return { items, pageInfo: { totalCount: Number(count[0]!.total), hasMore, nextCursor: hasMore ? `${payload}.${sign(payload).toString('base64url')}` : null } }
  }))
 })
 return router
}
