import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { assertWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import type { DriverPosition } from './driver-cursor.ts'
import type { ListDriversInput } from './driver-validator.ts'
import { driverSelect } from './driver-mapper.ts'

export function createDriverRepository(transaction: WorkflowTransaction) {
 assertWorkflowTransaction(transaction)
 async function find(id: string) {
  const driver = await transaction.driver.findUnique({ where: { id }, select: driverSelect })
  if (!driver) throw new HttpError(404, 'NOT_FOUND', 'Driver not found.')
  return driver
 }
 return {
  find,
  async list(input: ListDriversInput, position: DriverPosition | undefined) {
   const status = input.status ?? null; const online = input.isOnline ?? null; const createdAt = position?.createdAt ?? null; const id = position?.id ?? null
   const rows = await transaction.$queryRaw<{ id: string; createdAt: string }[]>`
    SELECT id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt" FROM drivers
    WHERE (${status}::text IS NULL OR status::text = ${status}) AND (${online}::boolean IS NULL OR online_status = ${online})
    AND (${createdAt}::timestamptz IS NULL OR created_at < ${createdAt}::timestamptz OR (created_at = ${createdAt}::timestamptz AND id < ${id}::uuid))
    ORDER BY created_at DESC, id DESC LIMIT ${input.limit + 1}`
   const counts = await transaction.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM drivers WHERE (${status}::text IS NULL OR status::text = ${status}) AND (${online}::boolean IS NULL OR online_status = ${online})`
   const records = await transaction.driver.findMany({ where: { id: { in: rows.map((row) => row.id) } }, select: driverSelect })
   const byId = new Map(records.map((driver) => [driver.id, driver]))
   return { totalCount: Number(counts[0]!.count), items: rows.map((position) => ({ driver: byId.get(position.id)!, position })) }
  },
 }
}
