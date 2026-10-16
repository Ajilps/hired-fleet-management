import type { OrderFilters } from '../types/order-types'
import { orderSources, orderStatuses } from '../types/order-types'
import { isUuid } from '../../../shared/api/response-validation'

export function normalizeAmount(value: string): string | null {
  const text = value.trim()
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  return `${whole}.${fraction.padEnd(2, '0')}`
}

export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

export function istDateTime(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) || !isCalendarDate(value.slice(0, 10))) return null
  return `${value}:00+05:30`
}

export function dateBoundary(value: string, exclusiveEnd = false): string {
  if (!exclusiveEnd) return `${value}T00:00:00+05:30`
  const nextDay = new Date(`${value}T00:00:00Z`)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  return `${nextDay.toISOString().slice(0, 10)}T00:00:00+05:30`
}

export function validateFilters(filters: OrderFilters): string | null {
  if (filters.companyId && !isUuid(filters.companyId)) return 'Choose a valid company.'
  if (filters.status && !orderStatuses.some((status) => status === filters.status)) return 'Choose a valid status.'
  if (filters.source && !orderSources.some((source) => source === filters.source)) return 'Choose a valid source.'
  if ((filters.from && !isCalendarDate(filters.from)) || (filters.to && !isCalendarDate(filters.to))) return 'Enter valid creation dates.'
  if (filters.from && filters.to && filters.from > filters.to) return 'The end date must be on or after the start date.'
  return null
}

export function filtersFromParams(params: URLSearchParams): OrderFilters {
  return Object.fromEntries(['status', 'companyId', 'from', 'to', 'cursor', 'search', 'source'].map((key) => [key, params.get(key) ?? ''])) as OrderFilters
}

export function safeOrdersReturn(value: string | null): string {
  return value === '/orders' || value?.startsWith('/orders?') ? value : '/orders'
}
