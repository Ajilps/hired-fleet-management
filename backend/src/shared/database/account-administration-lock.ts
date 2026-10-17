import type { WorkflowTransaction } from './workflow-transaction.ts'
import { assertWorkflowTransaction } from './workflow-transaction.ts'
import { HttpError } from '../http/http-error.ts'

// Reserved two-int advisory namespace. Take this BEFORE actor/session row locks:
// two admins disabling one another must not hold opposing actor SHARE locks.
export async function lockAccountAdministration(transaction: WorkflowTransaction) {
  assertWorkflowTransaction(transaction)
  try { await transaction.$queryRaw`SELECT pg_advisory_xact_lock(1213350482, 1)::text AS account_lock` }
  catch { throw new HttpError(503, 'ACCOUNT_CHANGE_RETRY_REQUIRED', 'Account changes are busy. Retry the same intent.', 1) }
}
