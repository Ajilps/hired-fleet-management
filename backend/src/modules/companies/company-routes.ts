import { Router } from 'express'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { AuthConfig } from '../auth/index.ts'
import { createCompanyController } from './company-controller.ts'
import { createCompanyService } from './company-service.ts'

export function createCompanyRouter(client: PrismaClient, auth: AuthConfig, fingerprintKey: Uint8Array) {
  const controller = createCompanyController(createCompanyService(client, auth, fingerprintKey))
  const router = Router()
  router.get('/companies', controller.list)
  router.post('/companies', controller.create)
  router.get('/companies/:companyId', controller.get)
  router.patch('/companies/:companyId', controller.update)
  router.get('/companies/:companyId/payout-rates', controller.rates)
  router.post('/companies/:companyId/payout-rates', controller.createRate)
  return router
}
