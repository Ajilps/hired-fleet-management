import type { PrismaClient, Prisma } from '../../generated/prisma/client.ts'
import { authenticateTransaction } from '../auth/index.ts'
import type { AuthConfig } from '../auth/index.ts'
import { aggregateEtag } from '../commands/index.ts'
import { createCompanyCursor } from '../companies/company-cursor.ts'
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import { tripScope as scope, projectTrip } from '../trips/trip-context.ts'
import { assignmentDto } from './order-mapper.ts'
import type { TripListInput } from './order-validator.ts'
export function createTripService(client: PrismaClient, auth: AuthConfig, key: Uint8Array) {
 const cursor = createCompanyCursor(key)
 const read = <T>(token: string, run: (tx: import('../../shared/database/workflow-transaction.ts').WorkflowTransaction, actor: Awaited<ReturnType<typeof authenticateTransaction>>) => Promise<T>, adminOnly = false) => client.$transaction(tx => withWorkflowTransaction(tx, async context => run(context, await authenticateTransaction(context, token, auth, adminOnly ? ['admin'] : ['admin', 'partner', 'driver']))), { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 })
 async function detail(tx: import('../../shared/database/workflow-transaction.ts').WorkflowTransaction, actor: Awaited<ReturnType<typeof authenticateTransaction>>, id: string) {
  const row = await tx.trip.findFirst({ where: { AND: [{ id }, await scope(tx, actor)] } })
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Trip not found.')
  return row
 }
 return {
  list(token: string, input: TripListInput) {
   return read(token, async (tx, actor) => {
    if (actor.role !== 'admin' && (input.companyId || input.driverId)) throw new HttpError(422, 'VALIDATION_FAILED', 'Only admins may supply company or driver filters.')
    const where: Prisma.TripWhereInput = { AND: [await scope(tx, actor), { ...(input.companyId ? { companyId: input.companyId } : {}), ...(input.driverId ? { currentDriverId: input.driverId } : {}), ...(input.status ? { status: input.status } : {}), scheduledPickupAt: { ...(input.scheduledFrom ? { gte: new Date(input.scheduledFrom) } : {}), ...(input.scheduledTo ? { lt: new Date(input.scheduledTo) } : {}) } }] }
    const filter = JSON.stringify(['trips', actor.userId, actor.companyId, actor.driverId, input.companyId, input.driverId, input.status, input.scheduledFrom, input.scheduledTo])
    const anchor = cursor.decode(filter, input.cursor)
    const totalCount = await tx.trip.count({ where })
    const rows = await tx.trip.findMany({ where: { AND: [where, anchor ? { OR: [{ scheduledPickupAt: { lt: anchor.createdAt } }, { scheduledPickupAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}] }, orderBy: [{ scheduledPickupAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 })
    const items = rows.slice(0, input.limit); const hasMore = rows.length > input.limit; const last = items.at(-1)
    return { items: await Promise.all(items.map(row => projectTrip(tx, row))), pageInfo: { totalCount, hasMore, nextCursor: hasMore ? cursor.encode(filter, { id: last!.id, createdAt: last!.scheduledPickupAt }) : null } }
   })
  },
  get(token: string, id: string) { return read(token, async (tx, actor) => { const row = await detail(tx, actor, id); return { body: await projectTrip(tx, row), etag: aggregateEtag('trip', id, row.version) } }) },
  assignments(token: string, id: string, input: { limit: number; cursor?: string }) {
   return read(token, async (tx, actor) => {
    await detail(tx, actor, id)
    const filter = `assignments:${actor.userId}:${id}`; const anchor = cursor.decode(filter, input.cursor)
    const totalCount = await tx.tripAssignment.count({ where: { tripId: id } })
    const rows = await tx.tripAssignment.findMany({ where: { tripId: id, ...(anchor ? { OR: [{ assignedAt: { lt: anchor.createdAt } }, { assignedAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}) }, orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 })
    const items = rows.slice(0, input.limit); const hasMore = rows.length > input.limit; const last = items.at(-1)
    return { items: items.map(assignmentDto), pageInfo: { totalCount, hasMore, nextCursor: hasMore ? cursor.encode(filter, { id: last!.id, createdAt: last!.assignedAt }) : null } }
   }, true)
  },
 }
}
