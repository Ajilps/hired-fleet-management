import { z } from 'zod'
import { validate } from '../auth/auth-validator.ts'
export { validate as parse }
export const documentTypes = ['driving_license', 'aadhar', 'pan', 'pcc'] as const
export const documentTypeSchema = z.enum(documentTypes)
export const documentIdSchema = z.uuid().transform(value => value.toLowerCase())
const dateSchema = z.iso.date().refine(value => new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value)
export const attachDocumentSchema = z.strictObject({
  documentType: documentTypeSchema,
  fileAssetId: documentIdSchema,
  documentNumber: z.string().trim().min(1).max(100).refine(value => Array.from(value).every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)).optional(),
  expiresOn: dateSchema.nullable().optional(),
})
export const listDocumentsSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(4096).optional(),
  isCurrent: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
})
export type AttachDocumentInput = z.infer<typeof attachDocumentSchema>
export type ListDocumentsInput = z.infer<typeof listDocumentsSchema>
