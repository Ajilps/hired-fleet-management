import { randomUUID } from 'node:crypto'
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { assertWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { hashPassword } from './password-service.ts'

export async function provisionDriverAccount(transaction: WorkflowTransaction, input: { email: string; fullName: string; phone: string; initialPassword: string }, now: Date) {
  assertWorkflowTransaction(transaction)
  return transaction.user.create({ data: { id: randomUUID(), email: input.email, fullName: input.fullName, phone: input.phone, role: 'Driver', passwordHash: await hashPassword(input.initialPassword), passwordChangeRequired: true, createdAt: now, updatedAt: now }, select: { id: true } })
}
