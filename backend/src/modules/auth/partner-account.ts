import { randomUUID } from 'node:crypto'
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { assertWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { hashPassword } from './password-service.ts'

// Called only inside an authorized durable command; never exposes the stored credential.
export async function createPartnerAccount(transaction: WorkflowTransaction, input: { email: string; fullName: string; phone?: string; initialPassword: string }, now: Date) {
  assertWorkflowTransaction(transaction)
  return transaction.user.create({ data: { id: randomUUID(), email: input.email, fullName: input.fullName, phone: input.phone ?? null, passwordHash: await hashPassword(input.initialPassword), passwordChangeRequired: true, role: 'Partner', createdAt: now, updatedAt: now }, select: { id: true } })
}
