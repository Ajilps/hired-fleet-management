import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import { bootstrapSchema, validate } from './auth-validator.ts'
import { hashPassword } from './password-service.ts'
import { createAuthRepository } from './auth-repository.ts'

// Operational module entry point; no public route and no existing-account updates.
export async function createAdminAccount(client: PrismaClient, input: unknown) {
  const account = validate(bootstrapSchema, input)
  await createAuthRepository(client).createAdmin({ id: randomUUID(), email: account.email, fullName: account.fullName, passwordHash: await hashPassword(account.password), role: 'Admin', createdAt: new Date(), updatedAt: new Date() })
}
