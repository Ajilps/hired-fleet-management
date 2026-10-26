import type { Prisma } from '../../generated/prisma/client.ts'
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { assertWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
export function createOrderRepository(tx: WorkflowTransaction) {
 assertWorkflowTransaction(tx)
 async function find(id: string, companyId: string | null = null) {
  const order = await tx.order.findFirst({ where: { id, ...(companyId ? { companyId } : {}) }, include: { trip: true } })
  if (!order) throw new HttpError(404, 'NOT_FOUND', 'Order not found.')
  return order
 }
 return {
  find,
  async lock(id: string) { await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`; return find(id) },
  async list(where: Prisma.OrderWhereInput, limit: number, anchor?: { createdAt: Date; id: string }) {
   const totalCount = await tx.order.count({ where })
   const items = await tx.order.findMany({ where: { AND: [where, anchor ? { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}] }, include: { trip: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 })
   return { items, totalCount }
  },
 }
}
