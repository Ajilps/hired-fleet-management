import type { Request, Response } from 'express'
import type { DriverService } from './driver-service.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import { parse, listDriversSchema, createDriverSchema, driverIdSchema } from './driver-validator.ts'

function bearer(request: Request) {
 const match = /^Bearer ([^ ]+)$/.exec(request.get('Authorization') ?? '')
 if (!match) throw new HttpError(401, 'UNAUTHORIZED', 'A bearer session is required.')
 return match[1]!
}
export function createDriverController(service: DriverService) {
 return {
  closed() { throw new HttpError(403, 'ADMIN_ONBOARDING_REQUIRED', 'Driver accounts are provisioned by an administrator.') },
  async own(request: Request, response: Response) { response.json(await service.own(bearer(request))) },
  async list(request: Request, response: Response) { response.json(await service.list(bearer(request), parse(listDriversSchema, request.query))) },
  async get(request: Request, response: Response) { response.json(await service.get(bearer(request), parse(driverIdSchema, request.params.driverId))) },
  async create(request: Request, response: Response) {
   const result = await service.create({ accessToken: bearer(request), key: request.get('Idempotency-Key') ?? '', requestId: response.locals.requestId as string }, parse(createDriverSchema, request.body))
   for (const [name, value] of Object.entries(result.response.headers ?? {})) response.setHeader(name, value)
   response.status(result.response.status).json(result.response.body)
  },
 }
}
