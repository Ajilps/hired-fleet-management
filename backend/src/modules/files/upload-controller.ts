import type { Request, Response } from 'express'
import { HttpError } from '../../shared/http/http-error.ts'
import { parseMultipartUpload } from './multipart-upload.ts'
import { inspectUpload, uploadFieldsSchema, uploadKeySchema } from './upload-policy.ts'
import type { UploadService } from './upload-service.ts'

export function createUploadController(service: UploadService) {
  let inFlightCount = 0
  return async function upload(request: Request, response: Response) {
    if (inFlightCount >= 4) throw new HttpError(503, 'UPLOAD_CAPACITY_REACHED', 'Upload capacity is busy. Retry the same intent.', 1)
    inFlightCount++
    try {
      const bearer = /^Bearer ([^ ]+)$/.exec(request.get('Authorization') ?? '')
      if (!bearer) throw new HttpError(401, 'UNAUTHORIZED', 'A bearer session is required.')
      const identity = { accessToken: bearer[1]!, origin: request.get('Origin'), csrfGuard: request.get('X-CSRF-Guard'), requestId: response.locals.requestId as string, key: request.get('Idempotency-Key') ?? '' }
      await service.preflight(identity)
      if (!uploadKeySchema.safeParse(identity.key).success) throw new HttpError(422, 'VALIDATION_FAILED', 'A valid Idempotency-Key is required.')
      const parsed = await parseMultipartUpload(request); const fields = uploadFieldsSchema.safeParse(parsed.fields)
      if (!fields.success) throw new HttpError(422, 'VALIDATION_FAILED', 'Upload purpose or driver context is invalid. Trip media is not implemented.')
      const metadata = await inspectUpload(parsed.bytes, parsed.originalFilename)
      const asset = await service.upload(identity, { bytes: parsed.bytes, metadata, driverId: fields.data.driverId })
      response.location(`/api/v1/file-assets/${asset.id}`).status(201).json(asset)
    } finally { inFlightCount-- }
  }
}
