import { requestAuthenticatedJson } from '../../../shared/api/api-client'
import { invalidResponse, readId, readObject, readPage, readText, readTimestamp } from '../../../shared/api/response-validation'
import { validateSplit } from '../validation/company-validation'
import type { Company, CreateCompanyInput, PayoutRate } from '../types/company-types'

function boundedText(value: unknown, max: number) {
  const text = readText(value)
  return text.length <= max ? text : invalidResponse()
}
function readCompany(value: unknown): Company {
  const row = readObject(value)
  if (typeof row.isActive !== 'boolean') return invalidResponse()
  const company = {
    id: readId(row.id), legalName: boundedText(row.legalName, 200), displayName: boundedText(row.displayName, 200),
    contactName: boundedText(row.contactName, 150), contactEmail: boundedText(row.contactEmail, 255), contactPhone: boundedText(row.contactPhone, 30),
    billingAddress: readText(row.billingAddress), isActive: row.isActive, createdAt: readTimestamp(row.createdAt), updatedAt: readTimestamp(row.updatedAt),
  }
  if (!/^[^\s@]+@[^\s@]+$/.test(company.contactEmail)) return invalidResponse()
  return company
}
export async function listCompanies(cursor: string, token: string, signal: AbortSignal) {
  const params = new URLSearchParams({ limit: '25' })
  if (cursor) params.set('cursor', cursor)
  const row = readObject(await requestAuthenticatedJson(`/api/v1/companies?${params}`, { accessToken: token, signal }))
  if (!Array.isArray(row.items)) return invalidResponse()
  const items = row.items.map(readCompany)
  if (new Set(items.map((item) => item.id)).size !== items.length) return invalidResponse()
  const pageInfo = readPage(row.pageInfo, items.length, 25)
  if (pageInfo.hasMore && pageInfo.nextCursor === cursor) return invalidResponse()
  return { items, pageInfo }
}
export async function getCompany(id: string, token: string, signal: AbortSignal) {
  const company = readCompany(await requestAuthenticatedJson(`/api/v1/companies/${encodeURIComponent(id)}`, { accessToken: token, signal }))
  return company.id === id ? company : invalidResponse()
}
export async function createCompany(input: CreateCompanyInput, key: string, token: string) {
  const company = readCompany(await requestAuthenticatedJson('/api/v1/companies', { method: 'POST', accessToken: token, body: input, idempotencyKey: key }))
  // A malformed or unrelated success remains an uncertain command outcome.
  for (const field of ['legalName', 'displayName', 'contactName', 'contactEmail', 'contactPhone', 'billingAddress'] as const) {
    if (company[field] !== input[field]) return invalidResponse()
  }
  return company
}
export async function listCompanyRates(id: string, cursor: string, token: string, signal: AbortSignal) {
  const params = new URLSearchParams({ limit: '25' })
  if (cursor) params.set('cursor', cursor)
  const row = readObject(await requestAuthenticatedJson(`/api/v1/companies/${encodeURIComponent(id)}/payout-rates?${params}`, { accessToken: token, signal }))
  if (!Array.isArray(row.items)) return invalidResponse()
  const items: PayoutRate[] = row.items.map((value) => {
    const rate = readObject(value)
    const driverPercent = readText(rate.driverPercent)
    const companyPercent = readText(rate.companyPercent)
    const split = validateSplit(driverPercent, companyPercent)
    if (!split || split.driverPercent !== driverPercent || split.companyPercent !== companyPercent || readId(rate.companyId) !== id) return invalidResponse()
    const effectiveFrom = readTimestamp(rate.effectiveFrom)
    const effectiveTo = rate.effectiveTo === null ? null : readTimestamp(rate.effectiveTo)
    if (effectiveTo && Date.parse(effectiveTo) <= Date.parse(effectiveFrom)) return invalidResponse()
    return { id: readId(rate.id), companyId: id, driverPercent, companyPercent, effectiveFrom, effectiveTo }
  })
  if (items.filter((rate) => rate.effectiveTo === null).length > 1 || new Set(items.map((rate) => rate.id)).size !== items.length) return invalidResponse()
  const pageInfo = readPage(row.pageInfo, items.length, 25)
  if (pageInfo.hasMore && pageInfo.nextCursor === cursor) return invalidResponse()
  return { items, pageInfo }
}
