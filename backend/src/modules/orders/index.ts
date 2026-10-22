import { Router } from 'express'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { AuthConfig } from '../auth/index.ts'
import { createOrderService } from './order-service.ts'
import { createOrderController } from './order-controller.ts'
import { createTripService } from './trip-service.ts'
import { bearer } from './order-controller.ts'
import { parse, idSchema, tripListSchema, pageSchema } from './order-validator.ts'
import type { OrderCodeCipher } from './order-code.ts'
export { readOrderCodeCipher } from './order-code.ts'
export function createOrderRouter(client: PrismaClient, auth: AuthConfig, fingerprintKey: Uint8Array, cipher?: OrderCodeCipher) {
 const controller = createOrderController(createOrderService(client, auth, fingerprintKey, cipher)); const router = Router()
 router.get('/orders', controller.list); router.post('/orders', controller.create)
 router.get('/orders/:orderId', controller.get)
 router.post('/orders/:orderId/accept', controller.accept); router.post('/orders/:orderId/reject', controller.reject)
 const trips = createTripService(client, auth, fingerprintKey)
 router.get('/trips', async (req, res) => { res.json(await trips.list(bearer(req), parse(tripListSchema, req.query))) })
 router.get('/trips/:tripId', async (req, res) => { const result = await trips.get(bearer(req), parse(idSchema, req.params.tripId)); res.setHeader('ETag', result.etag); res.json(result.body) })
 router.get('/trips/:tripId/assignments', async (req, res) => { res.json(await trips.assignments(bearer(req), parse(idSchema, req.params.tripId), parse(pageSchema, req.query))) })
 return router
}
