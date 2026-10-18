import type { Request, Response } from 'express'
import { z } from 'zod'
import { HttpError } from '../../shared/http/http-error.ts'
import type { FileService } from './file-service.ts'

export function createFileController(service: FileService) {
  return {
    async get(request: Request, response: Response) {
      const bearer = /^Bearer ([^ ]+)$/.exec(request.get('Authorization') ?? '')
      if (!bearer) throw new HttpError(401, 'UNAUTHORIZED', 'A bearer session is required.')
      const id = z.uuid().safeParse(request.params.assetId)
      if (!id.success) throw new HttpError(422, 'VALIDATION_FAILED', 'File asset identity must be a UUID.')
      response.json(await service.get(bearer[1]!, id.data.toLowerCase()))
    },
  }
}
