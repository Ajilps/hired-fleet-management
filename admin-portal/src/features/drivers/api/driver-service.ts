import { requestAuthenticatedJson } from '../../../shared/api/api-client'
import { invalidResponse, readId, readObject, readPage, readText, readTimestamp } from '../../../shared/api/response-validation'
import { driverStatuses } from '../types/driver-types'
import type { Driver, DriverFilters, DriverStatus } from '../types/driver-types'

function boundedText(value: unknown, max: number) {
  const text = readText(value)
  return text.length <= max ? text : invalidResponse()
}

function readBirthDate(value: unknown) {
  if (value === null) return null
  const date = readText(value)
  const time = Date.parse(date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) return invalidResponse()
  return date
}

function readDriver(value: unknown): Driver {
  const row = readObject(value)
  const user = readObject(row.user)
  const id = readId(row.id)
  if (!driverStatuses.includes(row.status as DriverStatus) || typeof row.isOnline !== 'boolean' || typeof user.isActive !== 'boolean' || user.role !== 'driver' || user.companyId !== null || (user.driverId !== null && user.driverId !== id)) return invalidResponse()
  const email = boundedText(user.email, 255)
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return invalidResponse()
  if (row.homeAddress !== null && (typeof row.homeAddress !== 'string' || row.homeAddress.length > 2000)) return invalidResponse()
  // Allowlist display fields so unexpected credentials and private file URLs never enter the cache.
  return {
    id, user: { id: readId(user.id), fullName: boundedText(user.fullName, 150), email, phone: user.phone === null ? null : boundedText(user.phone, 30), isActive: user.isActive },
    status: row.status as DriverStatus, dateOfBirth: readBirthDate(row.dateOfBirth), homeAddress: row.homeAddress,
    isOnline: row.isOnline, onboardedAt: row.onboardedAt === null ? null : readTimestamp(row.onboardedAt),
    activatedByUserId: row.activatedByUserId === null ? null : readId(row.activatedByUserId),
    createdAt: readTimestamp(row.createdAt), updatedAt: readTimestamp(row.updatedAt),
  }
}

export async function listDrivers({ status, online, cursor }: DriverFilters, token: string, signal: AbortSignal) {
  const params = new URLSearchParams({ limit: '25', status })
  if (online) params.set('isOnline', online)
  if (cursor) params.set('cursor', cursor)
  const row = readObject(await requestAuthenticatedJson(`/api/v1/drivers?${params}`, { accessToken: token, signal }))
  if (!Array.isArray(row.items)) return invalidResponse()
  const items = row.items.map(readDriver)
  if (new Set(items.map((item) => item.id)).size !== items.length || items.some((item) => item.status !== status || (online && String(item.isOnline) !== online))) return invalidResponse()
  const pageInfo = readPage(row.pageInfo, items.length, 25)
  if (pageInfo.hasMore && pageInfo.nextCursor === cursor) return invalidResponse()
  return { items, pageInfo }
}

export async function getDriver(id: string, token: string, signal: AbortSignal) {
  const driver = readDriver(await requestAuthenticatedJson(`/api/v1/drivers/${encodeURIComponent(id)}`, { accessToken: token, signal }))
  return driver.id === id ? driver : invalidResponse()
}
