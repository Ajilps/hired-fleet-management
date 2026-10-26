import { Router } from 'express'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { AuthConfig } from '../auth/index.ts'
import { createDocumentService } from './document-service.ts'
import { createDocumentController } from './document-controller.ts'
import type { DocumentCipher } from './document-crypto.ts'
export function createDocumentRouter(client: PrismaClient, auth: AuthConfig, key: Uint8Array, origins: string[], cipher?: DocumentCipher) {
  const router = Router(); const controller = createDocumentController(createDocumentService(client, auth, key, origins, cipher))
  router.get('/drivers/me/documents', controller.own)
  router.get('/drivers/:driverId/documents', controller.list)
  router.post('/drivers/me/documents', controller.attach)
  return router
}
