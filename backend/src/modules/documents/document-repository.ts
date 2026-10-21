import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import type { DocumentPosition } from './document-cursor.ts'
import type { ListDocumentsInput } from './document-validator.ts'
import { documentSelect } from './document-mapper.ts'

export function createDocumentRepository(transaction: WorkflowTransaction) {
  return {
    async driver(id: string, lock = false) {
      if (lock) await transaction.$queryRaw`SELECT id FROM drivers WHERE id = ${id}::uuid FOR UPDATE`
      const driver = await transaction.driver.findUnique({ where: { id }, select: { id: true, status: true } })
      if (!driver) throw new HttpError(404, 'NOT_FOUND', 'Driver not found.')
      return driver
    },
    async list(driverId: string, input: ListDocumentsInput, position?: DocumentPosition) {
      const current = input.isCurrent ?? null; const uploadedAt = position?.uploadedAt ?? null; const id = position?.id ?? null
      const rows = await transaction.$queryRaw<DocumentPosition[]>`
        SELECT id, to_char(uploaded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "uploadedAt"
        FROM driver_documents WHERE driver_id = ${driverId}::uuid AND (${current}::boolean IS NULL OR is_current = ${current})
        AND (${uploadedAt}::timestamptz IS NULL OR uploaded_at < ${uploadedAt}::timestamptz OR (uploaded_at = ${uploadedAt}::timestamptz AND id < ${id}::uuid))
        ORDER BY uploaded_at DESC, id DESC LIMIT ${input.limit + 1}`
      const totalCount = await transaction.driverDocument.count({ where: { driverId, ...(input.isCurrent === undefined ? {} : { isCurrent: input.isCurrent }) } })
      const records = await transaction.driverDocument.findMany({ where: { id: { in: rows.map(row => row.id) } }, select: documentSelect })
      const byId = new Map(records.map(row => [row.id, row]))
      return { totalCount, items: rows.map(position => ({ document: byId.get(position.id)!, position })) }
    },
  }
}
