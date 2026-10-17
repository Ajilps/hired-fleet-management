import type { Request, Response } from 'express'
import type { AccountService } from './account-service.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import { parse, accountIdSchema, listAccountsSchema, createAdminSchema, accountStatusSchema } from './account-validator.ts'

function bearer(request: Request) {
  const match = /^Bearer ([^ ]+)$/.exec(request.get('Authorization') ?? '')
  if (!match) throw new HttpError(401, 'UNAUTHORIZED', 'A bearer session is required.')
  return match[1]!
}
export function createAccountController(service: AccountService) {
  return {
    async list(request: Request, response: Response) { response.json(await service.list(bearer(request), parse(listAccountsSchema, request.query))) },
    async get(request: Request, response: Response) { response.json(await service.get(bearer(request), parse(accountIdSchema, request.params.userId))) },
    async setStatus(request: Request, response: Response) {
      const result = await service.setStatus({ accessToken: bearer(request), key: request.get('Idempotency-Key') ?? '', requestId: response.locals.requestId as string }, parse(accountIdSchema, request.params.userId), parse(accountStatusSchema, request.body))
      response.status(result.response.status).json(result.response.body)
    },
    async create(request: Request, response: Response) {
      const result = await service.create({ accessToken: bearer(request), key: request.get('Idempotency-Key') ?? '', requestId: response.locals.requestId as string }, parse(createAdminSchema, request.body))
      for (const [name, value] of Object.entries(result.response.headers ?? {})) response.setHeader(name, value)
      response.status(result.response.status).json(result.response.body)
    },
  }
}
