import { requestAuthenticatedJson } from '../../../shared/api/api-client'
import { invalidResponse, readId, readObject, readPage, readText } from '../../../shared/api/response-validation'

export type CompanyOption = { id: string; displayName: string; isActive: boolean }
function readCompany(value: unknown): CompanyOption {
  const row = readObject(value)
  if (typeof row.isActive !== 'boolean') return invalidResponse()
  return { id: readId(row.id), displayName: readText(row.displayName), isActive: row.isActive }
}
export async function listCompanyOptions(cursor: string, token: string, signal: AbortSignal) {
  const params = new URLSearchParams({ limit: '25' })
  if (cursor) params.set('cursor', cursor)
  const row = readObject(await requestAuthenticatedJson(`/api/v1/companies?${params}`, { accessToken: token, signal }))
  if (!Array.isArray(row.items)) return invalidResponse()
  const items = row.items.map(readCompany)
  return { items, pageInfo: readPage(row.pageInfo, items.length, 25) }
}
export async function getCompanyOption(id: string, token: string, signal: AbortSignal) {
  const company = readCompany(await requestAuthenticatedJson(`/api/v1/companies/${encodeURIComponent(id)}`, { accessToken: token, signal }))
  if (company.id !== id) return invalidResponse()
  return company
}
