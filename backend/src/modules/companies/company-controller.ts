import type { Request, Response } from 'express'
import type { CommandResult } from '../commands/index.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import type { CompanyService } from './company-service.ts'
import { parse, companyIdSchema, createCompanySchema, patchCompanySchema, createRateSchema, createPartnerSchema, listSchema } from './company-validator.ts'

function bearer(request: Request) {
  const match = /^Bearer ([^ ]+)$/.exec(request.get('Authorization') ?? '')
  if (!match) throw new HttpError(401, 'UNAUTHORIZED', 'A bearer session is required.')
  return match[1]!
}
function identity(request: Request, response: Response) { return { accessToken: bearer(request), key: request.get('Idempotency-Key') ?? '', requestId: response.locals.requestId as string } }
function id(request: Request) { return parse(companyIdSchema, request.params.companyId) }
function send(response: Response, result: CommandResult) {
  for (const [name, value] of Object.entries(result.response.headers ?? {})) response.setHeader(name, value)
  response.status(result.response.status).json(result.response.body)
}
export function createCompanyController(service: CompanyService) {
  return {
    async list(request: Request, response: Response) { response.json(await service.list(bearer(request), parse(listSchema, request.query))) },
    async get(request: Request, response: Response) { response.json(await service.get(bearer(request), id(request))) },
    async rates(request: Request, response: Response) { response.json(await service.rates(bearer(request), id(request), parse(listSchema, request.query))) },
    async create(request: Request, response: Response) { send(response, await service.create(identity(request, response), parse(createCompanySchema, request.body))) },
    async update(request: Request, response: Response) { send(response, await service.update(identity(request, response), id(request), parse(patchCompanySchema, request.body))) },
    async partners(request: Request, response: Response) { response.json(await service.partners(bearer(request), id(request), parse(listSchema, request.query))) },
    async createPartner(request: Request, response: Response) { send(response, await service.createPartner(identity(request, response), id(request), parse(createPartnerSchema, request.body))) },
    async createRate(request: Request, response: Response) { send(response, await service.createRate(identity(request, response), id(request), parse(createRateSchema, request.body))) },
  }
}
