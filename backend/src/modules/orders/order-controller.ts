import { sendApiError } from '../../shared/http/api-error.ts'
import type { Request, Response } from 'express'
import { HttpError } from '../../shared/http/http-error.ts'
import type { CommandResult } from '../commands/index.ts'
import type { createOrderService } from './order-service.ts'
import { parse, idSchema, createOrderSchema, orderListSchema, acceptSchema, rejectSchema } from './order-validator.ts'
export function bearer(request: Request) { const match = /^Bearer ([^ ]+)$/.exec(request.get('Authorization') ?? ''); if (!match) throw new HttpError(401, 'UNAUTHORIZED', 'A bearer session is required.'); return match[1]! }
export function identity(request: Request, response: Response) { return { accessToken: bearer(request), key: request.get('Idempotency-Key') ?? '', requestId: response.locals.requestId as string, ifMatch: request.get('If-Match') } }
export function sendCommand(response: Response, result: CommandResult) {
 if (result.response.status >= 400) {
  const body = result.response.body as { error: { code: string; message: string; retryAfterSeconds?: number | null } }
  const retry = body.error.retryAfterSeconds ?? null
  if (retry !== null) response.setHeader('Retry-After', retry)
  sendApiError(response, result.response.status, body.error.code, body.error.message, retry); return
 }
 for (const [key, value] of Object.entries(result.response.headers ?? {})) response.setHeader(key, value)
 response.status(result.response.status).json(result.response.body)
}
export function createOrderController(service: ReturnType<typeof createOrderService>) {
 return {
  async list(req: Request, res: Response) { res.json(await service.list(bearer(req), parse(orderListSchema, req.query))) },
  async get(req: Request, res: Response) { const result = await service.get(bearer(req), parse(idSchema, req.params.orderId)); res.setHeader('ETag', result.etag); res.json(result.body) },
  async create(req: Request, res: Response) { sendCommand(res, await service.create(identity(req, res), parse(createOrderSchema, req.body))) },
  async accept(req: Request, res: Response) { sendCommand(res, await service.decision(identity(req, res), parse(idSchema, req.params.orderId), 'accept', parse(acceptSchema, req.body))) },
  async reject(req: Request, res: Response) { sendCommand(res, await service.decision(identity(req, res), parse(idSchema, req.params.orderId), 'reject', parse(rejectSchema, req.body))) },
 }
}
