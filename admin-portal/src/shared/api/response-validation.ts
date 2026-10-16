import { ApiError } from './api-client'

export function invalidResponse(): never { throw new ApiError(502, 'The server returned an unexpected response. Refresh and try again.') }
export function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidResponse()
  return value as Record<string, unknown>
}
export function readText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return invalidResponse()
  return value
}
export function readId(value: unknown): string {
  const id = readText(value)
  if (!isUuid(id)) return invalidResponse()
  return id
}
export function isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) }
export function readTimestamp(value: unknown): string {
  const time = readText(value)
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(time) || !Number.isFinite(Date.parse(time)) || new Date(time.slice(0, 10)).toISOString().slice(0, 10) !== time.slice(0, 10)) return invalidResponse()
  return time
}
export function readNullableText(value: unknown): string | null { return value === null ? null : readText(value) }
export function readPage(value: unknown, size: number, limit: number) {
  const page = readObject(value)
  if (!Number.isSafeInteger(page.totalCount) || (page.totalCount as number) < size || size > limit || typeof page.hasMore !== 'boolean') return invalidResponse()
  if (page.hasMore ? typeof page.nextCursor !== 'string' || !page.nextCursor || size === 0 : page.nextCursor !== null) return invalidResponse()
  return { totalCount: page.totalCount as number, hasMore: page.hasMore, nextCursor: page.nextCursor as string | null }
}
export function readEtag(value: string | null): string | null { return value && /^"[^"\r\n]+"$/.test(value) ? value : null }
