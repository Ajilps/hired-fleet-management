import type { Request, Response } from 'express'
import { HttpError } from '../../shared/http/http-error.ts'
import type { createDocumentService } from './document-service.ts'
import { parse, documentIdSchema, listDocumentsSchema, attachDocumentSchema } from './document-validator.ts'
function bearer(request: Request) {
  const match = /^Bearer ([^ ]+)$/.exec(request.get('Authorization') ?? '')
  if (!match) throw new HttpError(401, 'UNAUTHORIZED', 'A bearer session is required.')
  return match[1]!
}
export function createDocumentController(service: ReturnType<typeof createDocumentService>) {
  return {
    async own(request: Request, response: Response) { response.json(await service.list(bearer(request), parse(listDocumentsSchema, request.query))) },
    async list(request: Request, response: Response) { response.json(await service.list(bearer(request), parse(listDocumentsSchema, request.query), parse(documentIdSchema, request.params.driverId))) },
    async attach(request: Request, response: Response) {
      const identity = { accessToken: bearer(request), key: request.get('Idempotency-Key') ?? '', requestId: response.locals.requestId as string, origin: request.get('Origin'), csrfGuard: request.get('X-CSRF-Guard') }
      const result = await service.attach(identity, parse(attachDocumentSchema, request.body))
      response.status(result.response.status).json(result.response.body)
    },
  }
}
