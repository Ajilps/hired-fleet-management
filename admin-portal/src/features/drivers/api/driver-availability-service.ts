import { ApiError, requestAuthenticatedJson } from '../../../shared/api/api-client'
import { invalidResponse, isUuid, readObject, readPage, readText, readTimestamp } from '../../../shared/api/response-validation'
import type { AvailabilityDate } from '../types/driver-availability-types'
import { isLocalDate, rangeDayCount } from '../validation/driver-calendar'

export async function listDriverAvailability(driverId: string, from: string, to: string, token: string, signal: AbortSignal) {
  const dayCount = rangeDayCount(from, to)
  if (!isUuid(driverId) || dayCount === null) throw new ApiError(400, 'Choose a valid driver and a calendar range of 1–31 days.')
  const dates: AvailabilityDate[] = []
  const seenCursors = new Set<string>()
  let cursor = ''
  // One record per local date. Finish all pages before interpreting absent dates as not provided.
  for (let page = 0; page < dayCount; page++) {
    signal.throwIfAborted()
    const params = new URLSearchParams({ limit: '25', fromDate: from, toDate: to })
    if (cursor) params.set('cursor', cursor)
    const row = readObject(await requestAuthenticatedJson(`/api/v1/drivers/${encodeURIComponent(driverId)}/availability-dates?${params}`, { accessToken: token, signal }))
    signal.throwIfAborted()
    if (!Array.isArray(row.items)) return invalidResponse()
    const info = readPage(row.pageInfo, row.items.length, 25)
    if (info.totalCount > dayCount) return invalidResponse()
    for (const value of row.items) {
      const item = readObject(value)
      const date = readText(item.availabilityDate)
      if (!isLocalDate(date) || date < from || date >= to || typeof item.isAvailable !== 'boolean' || (item.note !== null && (typeof item.note !== 'string' || item.note.length > 250)) || (dates.length && date <= dates.at(-1)!.availabilityDate)) return invalidResponse()
      dates.push({ availabilityDate: date, isAvailable: item.isAvailable, note: item.note, updatedAt: readTimestamp(item.updatedAt) })
    }
    if (!info.hasMore) return dates.length === info.totalCount ? dates : invalidResponse()
    if (!info.nextCursor || seenCursors.has(info.nextCursor)) return invalidResponse()
    seenCursors.add(info.nextCursor)
    cursor = info.nextCursor
  }
  return invalidResponse()
}
