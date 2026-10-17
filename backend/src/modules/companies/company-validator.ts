import { z } from 'zod'
import { HttpError } from '../../shared/http/http-error.ts'

const text = (max: number) => z.string().trim().min(1).max(max).refine((value) => !value.includes('\0'))
const fields = { legalName: text(200), displayName: text(200), contactName: text(150), contactEmail: z.email().max(255), contactPhone: text(30), billingAddress: text(4000) }
const percent = z.string().regex(/^(?:100\.00|(?:[0-9]|[1-9][0-9])\.[0-9]{2})$/).refine((value) => value !== '0.00')
function validSplit(value: { driverPercent: string; companyPercent: string }) { try { return BigInt(value.driverPercent.replace('.', '')) + BigInt(value.companyPercent.replace('.', '')) === 10_000n } catch { return false } }
export const splitSchema = z.strictObject({ driverPercent: percent, companyPercent: percent }).refine(validSplit, 'The split must total 100.00.')
export const createCompanySchema = z.strictObject({ ...fields, initialPayoutRate: splitSchema })
export const patchCompanySchema = z.strictObject(fields).partial().extend({ isActive: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0)
export const createRateSchema = z.strictObject({ driverPercent: percent, companyPercent: percent, reason: text(500) }).refine(validSplit, 'The split must total 100.00.')
export const listSchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().min(1).max(2048).optional() })
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new HttpError(422, 'VALIDATION_FAILED', 'One or more company fields are invalid.')
  return result.data
}
export const companyIdSchema = z.uuid().transform((value) => value.toLowerCase())
export type CreateCompanyInput = z.infer<typeof createCompanySchema>
export type PatchCompanyInput = Partial<{ legalName: string; displayName: string; contactName: string; contactEmail: string; contactPhone: string; billingAddress: string; isActive: boolean }>
export type CreateRateInput = z.infer<typeof createRateSchema>
export type ListInput = z.infer<typeof listSchema>
