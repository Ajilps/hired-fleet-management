import { z } from 'zod'
import { HttpError } from '../../shared/http/http-error.ts'

const text = (max: number) => z.string().trim().min(1).max(max).refine((value) => !value.includes('\0'))
export const accountIdSchema = z.uuid().transform((value) => value.toLowerCase())
export const listAccountsSchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().min(1).max(2048).optional(), role: z.enum(['admin', 'partner', 'driver']).optional() })
export const createAdminSchema = z.strictObject({ email: z.email().max(255).transform((value) => value.toLowerCase()), fullName: text(150), phone: text(30).optional(), role: z.literal('admin'), initialPassword: z.string().min(15).max(128) })
export const accountStatusSchema = z.strictObject({ isActive: z.boolean(), reason: text(500) })
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new HttpError(422, 'VALIDATION_FAILED', 'One or more account fields are invalid.')
  return result.data
}
export type ListAccountsInput = z.infer<typeof listAccountsSchema>
export type CreateAdminInput = z.infer<typeof createAdminSchema>
export type AccountStatusInput = z.infer<typeof accountStatusSchema>
