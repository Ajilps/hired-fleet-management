import { ApiError, requestAuthenticatedJson } from '../../../shared/api/api-client'
import { overviewSections } from '../types/overview-types'
import type { OverviewRecord, OverviewSection, OverviewSummary } from '../types/overview-types'

function invalidResponse(): never {
  throw new ApiError(502, 'This summary could not be read. Please try again.')
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidResponse()
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return invalidResponse()
  return value
}

function timestamp(value: unknown): string {
  const result = text(value)
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(result) || !Number.isFinite(Date.parse(result))) return invalidResponse()
  date(result.slice(0, 10))
  return result
}

function date(value: unknown): string {
  const result = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) return invalidResponse()
  return result
}

export async function getOverviewSummary(section: OverviewSection, accessToken: string, signal: AbortSignal): Promise<OverviewSummary> {
  const config = overviewSections.find((entry) => entry.key === section)!
  const params = new URLSearchParams({ status: config.status, limit: String(config.limit) })
  const response = object(await requestAuthenticatedJson(`/api/v1${config.path}?${params}`, { accessToken, signal }))
  const page = object(response.pageInfo)
  if (!Array.isArray(response.items) || !Number.isSafeInteger(page.totalCount) || (page.totalCount as number) < 0 ||
    typeof page.hasMore !== 'boolean' || !(page.nextCursor === null || typeof page.nextCursor === 'string')) return invalidResponse()
  const totalCount = page.totalCount as number
  if (response.items.length > config.limit || response.items.length > totalCount ||
    (page.hasMore ? !page.nextCursor || totalCount <= response.items.length || response.items.length === 0 : page.nextCursor !== null || totalCount !== response.items.length)) return invalidResponse()

  const items = response.items.map((value): OverviewRecord => {
    const row = object(value)
    if (row.status !== config.status) return invalidResponse()
    const common = { id: text(row.id), companyId: text(row.companyId) }
    if (section === 'statements') return { ...common, periodStart: date(row.periodStart) }
    return {
      ...common,
      route: `${text(object(row.pickup).address)} → ${text(object(row.drop).address)}`,
      pickupAt: timestamp(section === 'orders' ? row.requestedPickupAt : row.scheduledPickupAt),
    }
  })
  if (new Set(items.map((item) => item.id)).size !== items.length) return invalidResponse()
  return { totalCount, items }
}
