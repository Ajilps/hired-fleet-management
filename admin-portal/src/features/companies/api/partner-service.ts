import { ApiError, requestAuthenticatedJson } from '../../../shared/api/api-client'
import { invalidResponse, isUuid, readId, readObject, readPage, readText, readTimestamp } from '../../../shared/api/response-validation'
import type { CompanyPartner, CreatePartnerInput } from '../types/partner-types'

function bounded(value: unknown, limit: number) { const text = readText(value); return text.length <= limit ? text : invalidResponse() }
function readPartner(value: unknown, companyId: string): CompanyPartner {
  const row = readObject(value)
  const user = readObject(row.user)
  if (readId(row.companyId) !== companyId || readId(user.companyId) !== companyId || user.role !== 'partner' || user.driverId !== null || typeof user.isActive !== 'boolean' || typeof row.isPrimaryContact !== 'boolean') return invalidResponse()
  const email = bounded(user.email, 255)
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return invalidResponse()
  // Keep only allowed account fields; never cache an echoed credential or token.
  return { companyId, isPrimaryContact: row.isPrimaryContact, user: { id: readId(user.id), email, fullName: bounded(user.fullName, 150), phone: user.phone === null ? null : bounded(user.phone, 30), isActive: user.isActive, createdAt: readTimestamp(user.createdAt) } }
}
function partnerPath(companyId: string) {
  if (!isUuid(companyId)) throw new ApiError(400, 'This company record is unavailable.')
  return `/api/v1/companies/${encodeURIComponent(companyId)}/partners`
}
export async function listCompanyPartners(companyId: string, cursor: string, token: string, signal: AbortSignal) {
  const params = new URLSearchParams({ limit: '25' })
  if (cursor) params.set('cursor', cursor)
  const row = readObject(await requestAuthenticatedJson(`${partnerPath(companyId)}?${params}`, { accessToken: token, signal }))
  if (!Array.isArray(row.items)) return invalidResponse()
  const items = row.items.map((item) => readPartner(item, companyId))
  const pageInfo = readPage(row.pageInfo, items.length, 25)
  if (new Set(items.map((item) => item.user.id)).size !== items.length || (pageInfo.hasMore && pageInfo.nextCursor === cursor)) return invalidResponse()
  return { items, pageInfo }
}
export async function createCompanyPartner(companyId: string, input: CreatePartnerInput, key: string, token: string, signal?: AbortSignal) {
  let response: unknown
  try {
    response = await requestAuthenticatedJson(partnerPath(companyId), {
      accessToken: token, method: 'POST', idempotencyKey: key, signal,
      body: { email: input.email, fullName: input.fullName, ...(input.phone !== undefined ? { phone: input.phone } : {}), initialPassword: input.initialPassword, isPrimaryContact: input.isPrimaryContact },
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && error.code !== 'COMMAND_IN_PROGRESS') throw new ApiError(409, 'Account setup conflicts with an existing account or membership. Refresh partner accounts and review the email before trying again.', error.code, error.retryAt)
    throw error
  }
  const partner = readPartner(response, companyId)
  if (partner.user.email !== input.email.toLowerCase() || partner.user.fullName !== input.fullName || partner.user.phone !== (input.phone ?? null) || partner.isPrimaryContact !== input.isPrimaryContact) return invalidResponse()
  return partner
}
