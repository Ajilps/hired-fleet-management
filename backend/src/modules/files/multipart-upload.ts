import busboy from 'busboy'
import type { Request } from 'express'
import { HttpError } from '../../shared/http/http-error.ts'
import { MAX_UPLOAD_BYTES } from './upload-policy.ts'

export function parseMultipartUpload(request: Request): Promise<{ fields: Record<string, string>; bytes: Buffer; originalFilename: string }> {
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof busboy>
    try { parser = busboy({ headers: request.headers, preservePath: true, defParamCharset: 'utf8', limits: { files: 1, fields: 2, parts: 4, fileSize: MAX_UPLOAD_BYTES + 1, fieldSize: 1024, fieldNameSize: 32, headerPairs: 40 } }) }
    catch { reject(new HttpError(400, 'VALIDATION_FAILED', 'A valid multipart/form-data upload is required.')); return }
    let settled = false; let originalFilename = ''; let hasFile = false; let totalBytes = 0; let fileBytes = 0
    const fields: Record<string, string> = Object.create(null) as Record<string, string>; const chunks: Buffer[] = []
    const deadline = setTimeout(() => fail(new HttpError(408, 'UPLOAD_TIMEOUT', 'Upload body did not arrive in time.')), 10_000); deadline.unref()
    function clean() { clearTimeout(deadline); request.off('aborted', aborted); request.off('error', aborted); request.off('data', countBytes) }
    function fail(error: HttpError) { if (settled) return; settled = true; clean(); request.unpipe(parser); queueMicrotask(() => parser.destroy()); request.resume(); reject(error) }
    function aborted() { fail(new HttpError(400, 'UPLOAD_INTERRUPTED', 'Upload body was interrupted.')) }
    function countBytes(chunk: Buffer) { totalBytes += chunk.length; if (totalBytes > MAX_UPLOAD_BYTES + 16 * 1024) fail(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Upload request is too large.')) }
    request.on('aborted', aborted); request.on('error', aborted); request.on('data', countBytes)
    parser.on('error', () => fail(new HttpError(400, 'VALIDATION_FAILED', 'Multipart upload is malformed.')))
    parser.on('field', (name, value, info) => {
      if (Object.hasOwn(fields, name) || info.nameTruncated || info.valueTruncated) { fail(new HttpError(422, 'VALIDATION_FAILED', 'Upload fields must be unique and bounded.')); return }
      fields[name] = value
    })
    parser.on('file', (name, stream, info) => {
      stream.on('error', () => fail(new HttpError(400, 'UPLOAD_INTERRUPTED', 'Upload file was interrupted.')))
      if (name !== 'file' || hasFile) { stream.resume(); fail(new HttpError(422, 'VALIDATION_FAILED', 'Exactly one file field is required.')); return }
      hasFile = true; originalFilename = info.filename ?? ''
      stream.on('limit', () => fail(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Files may not exceed 5 MiB.')))
      stream.on('data', (chunk: Buffer) => { if (settled) return; fileBytes += chunk.length; if (fileBytes > MAX_UPLOAD_BYTES) fail(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Files may not exceed 5 MiB.')); else chunks.push(chunk) })
    })
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const) parser.on(event, () => fail(new HttpError(422, 'VALIDATION_FAILED', 'Upload has too many fields or files.')))
    parser.on('close', () => {
      if (settled) return
      if (!hasFile) { fail(new HttpError(422, 'VALIDATION_FAILED', 'Exactly one file field is required.')); return }
      settled = true; clean(); resolve({ fields, bytes: Buffer.concat(chunks, fileBytes), originalFilename })
    })
    request.pipe(parser)
  })
}
