import { Router } from 'express'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { AuthConfig } from '../auth/index.ts'
import { createDriverService } from './driver-service.ts'
import { createDriverController } from './driver-controller.ts'

export function createDriverRouter(client: PrismaClient, auth: AuthConfig, fingerprintKey: Uint8Array, origins: string[] = []) {
 const router = Router(); const controller = createDriverController(createDriverService(client, auth, fingerprintKey, origins))
 router.post('/driver-applications', controller.closed)
 router.get('/drivers/me', controller.own)
 router.get('/drivers', controller.list)
 router.get('/drivers/:driverId', controller.get)
 router.post('/drivers', controller.create)
 router.patch('/drivers/:driverId/status', controller.activate)
 return router
}
