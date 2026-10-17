import { Router } from 'express'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { AuthConfig } from '../auth/index.ts'
import { createAccountService } from './account-service.ts'
import { createAccountController } from './account-controller.ts'

export function createAccountRouter(client: PrismaClient, auth: AuthConfig, fingerprintKey: Uint8Array) {
  const controller = createAccountController(createAccountService(client, auth, fingerprintKey))
  const router = Router()
  router.get('/users', controller.list)
  router.post('/users', controller.create)
  router.get('/users/:userId', controller.get)
  router.patch('/users/:userId/status', controller.setStatus)
  return router
}
