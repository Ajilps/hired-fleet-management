import { fileTypeFromBuffer } from 'file-type'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { HttpError } from '../../shared/http/http-error.ts'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const uploadFieldsSchema = z.strictObject({ purpose: z.literal('driver_document'), driverId: z.uuid().transform((id) => id.toLowerCase()).optional() })
export const uploadKeySchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9:_-]+$/)
export async function inspectUpload(bytes: Buffer, originalFilename: string) {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Files must contain between 1 byte and 5 MiB.')
  if (!originalFilename.trim() || originalFilename.length > 255 || Array.from(originalFilename).some((character) => { const code = character.charCodeAt(0); return code < 32 || code === 47 || code === 92 || code === 127 })) throw new HttpError(422, 'VALIDATION_FAILED', 'The original filename is invalid.')
  let mimeType: string | undefined
  try { mimeType = (await fileTypeFromBuffer(bytes))?.mime } catch { /* Truncated signatures are unsupported content. */ }
  if (!mimeType || !['application/pdf', 'image/jpeg', 'image/png'].includes(mimeType)) throw new HttpError(415, 'UNSUPPORTED_FILE_TYPE', 'Only PDF, JPEG and PNG file content is permitted.')
  return { originalFilename, mimeType, sizeBytes: bytes.length, checksumSha256: createHash('sha256').update(bytes).digest('hex') }
}
export type InspectedUpload = Awaited<ReturnType<typeof inspectUpload>>
