import { z } from 'zod'
import { HttpError } from '../../shared/http/http-error.ts'

export const loginSchema = z.strictObject({
  email: z.email().max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(1024),
  deviceName: z.string().trim().max(150).optional(),
  transport: z.enum(['browser', 'token']).default('token'),
})
export const refreshSchema = z.union([
  z.strictObject({ transport: z.literal('browser') }),
  z.strictObject({ transport: z.literal('token').optional(), refreshToken: z.string().min(1).max(100) }),
])
export const changePasswordSchema = z.strictObject({ currentPassword: z.string().min(1).max(1024), newPassword: z.string().min(15).max(128) }).refine((value) => value.currentPassword !== value.newPassword)
export const bootstrapSchema = z.strictObject({
  email: z.email().max(255).transform((value) => value.toLowerCase()),
  fullName: z.string().trim().min(1).max(150),
  password: z.string().min(15).max(128),
})
export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new HttpError(422, 'VALIDATION_FAILED', 'One or more fields are invalid.')
  return result.data
}
export function parseRefreshToken(token: string) {
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(token)
  if (!match) throw new HttpError(401, 'UNAUTHORIZED', 'The session is invalid or expired.')
  return { sessionId: match[1]!, token }
}
