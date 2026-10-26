import { randomUUID } from 'node:crypto'
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { assertWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { hashPassword } from './password-service.ts'

// Auth owns credentials; callers receive only the identity needed for their workflow.
export async function provisionAdminAccount(transaction: WorkflowTransaction, input: { email: string; fullName: string; phone?: string; initialPassword: string }, now: Date) {
  assertWorkflowTransaction(transaction)
  return transaction.user.create({ data: { id: randomUUID(), email: input.email, fullName: input.fullName, phone: input.phone ?? null, passwordHash: await hashPassword(input.initialPassword), passwordChangeRequired: true, role: 'Admin', createdAt: now, updatedAt: now }, select: { id: true } })
}
