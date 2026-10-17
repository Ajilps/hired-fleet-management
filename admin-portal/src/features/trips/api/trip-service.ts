import { requestAuthenticatedJson } from '../../../shared/api/api-client'
import { invalidResponse, readId, readObject, readText, readTimestamp } from '../../../shared/api/response-validation'

export function readTrip(value: unknown) {
  const row = readObject(value)
  if (!['unassigned', 'assigned', 'ongoing', 'closed'].includes(row.status as string) || typeof row.totalAmount !== 'string' || !/^(?:0|[1-9]\d{0,9})\.\d{2}$/.test(row.totalAmount) || row.currency !== 'INR') return invalidResponse()
  return {
    id: readId(row.id), orderId: readId(row.orderId), companyId: readId(row.companyId), status: row.status as string,
    totalAmount: row.totalAmount, pickup: readText(readObject(row.pickup).address), drop: readText(readObject(row.drop).address),
    scheduledPickupAt: readTimestamp(row.scheduledPickupAt),
  }
}
export async function getTrip(id: string, token: string, signal: AbortSignal) {
  const trip = readTrip(await requestAuthenticatedJson(`/api/v1/trips/${encodeURIComponent(id)}`, { accessToken: token, signal }))
  if (trip.id !== id) return invalidResponse()
  return trip
}
