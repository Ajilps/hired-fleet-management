import { z } from 'zod'
import { HttpError } from '../../shared/http/http-error.ts'
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes('\0'))
export const idSchema = z.uuid().transform(value => value.toLowerCase())
const timestamp = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(new Date(value).getTime()) && new Date(value).getUTCFullYear() >= 2000 && new Date(value).getUTCFullYear() <= 9999)
const location = z.strictObject({ address: text(4000), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() }).refine(value => (value.latitude === undefined) === (value.longitude === undefined))
export const createOrderSchema = z.strictObject({ pickup: location, drop: location, requestedPickupAt: timestamp, contact: z.strictObject({ name: text(150), phone: text(30) }), vehicleNotes: text(2000).nullable().optional(), serviceNotes: text(2000).nullable().optional(), companyId: idSchema.optional(), source: z.enum(['admin_phone', 'admin_whatsapp', 'admin_manual']).optional(), routeDistanceKm: z.string().regex(/^(?!0\.00$)(?:0|[1-9][0-9]{0,7})\.[0-9]{2}$/).nullable().optional() })
export const acceptSchema = z.strictObject({ totalAmount: z.string().regex(/^(?:0|[1-9][0-9]{0,9})\.[0-9]{2}$/) })
export const rejectSchema = z.strictObject({ reason: text(2000) })
export const pageSchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().min(1).max(2048).optional() })
export const orderListSchema = pageSchema.extend({ companyId: idSchema.optional(), status: z.enum(['received', 'accepted', 'rejected']).optional(), createdFrom: timestamp.optional(), createdTo: timestamp.optional() }).refine(value => !value.createdFrom || !value.createdTo || new Date(value.createdFrom) < new Date(value.createdTo))
export const tripListSchema = pageSchema.extend({ companyId: idSchema.optional(), driverId: idSchema.optional(), status: z.enum(['unassigned', 'assigned', 'ongoing', 'closed']).optional(), scheduledFrom: timestamp.optional(), scheduledTo: timestamp.optional() }).refine(value => !value.scheduledFrom || !value.scheduledTo || new Date(value.scheduledFrom) < new Date(value.scheduledTo))
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
 const result = schema.safeParse(input)
 if (!result.success) throw new HttpError(422, 'VALIDATION_FAILED', 'One or more order or trip fields are invalid.')
 return result.data
}
export type CreateOrderInput = z.infer<typeof createOrderSchema>
export type OrderListInput = z.infer<typeof orderListSchema>
export type TripListInput = z.infer<typeof tripListSchema>
