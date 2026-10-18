import { z } from 'zod'
import { HttpError } from '../../shared/http/http-error.ts'

const text = (max: number) => z.string().trim().min(1).max(max).refine((value) => !value.includes('\0'))
export const driverIdSchema = z.uuid().transform((value) => value.toLowerCase())
export const createDriverSchema = z.strictObject({ email: z.email().max(255).transform((value) => value.toLowerCase()), fullName: text(150), phone: text(30), initialPassword: z.string().min(15).max(128), dateOfBirth: z.iso.date().refine((value) => value <= new Date().toISOString().slice(0, 10), 'Birth date cannot be in the future.').optional(), homeAddress: text(2000).optional() })
export const listDriversSchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().min(1).max(2048).optional(), status: z.enum(['pending','active','inactive','suspended']).optional(), isOnline: z.enum(['true','false']).transform((value) => value === 'true').optional() })
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
 const result = schema.safeParse(value)
 if (!result.success) throw new HttpError(422, 'VALIDATION_FAILED', 'One or more driver fields are invalid.')
 return result.data
}
export type CreateDriverInput = z.infer<typeof createDriverSchema>
export type ListDriversInput = z.infer<typeof listDriversSchema>
