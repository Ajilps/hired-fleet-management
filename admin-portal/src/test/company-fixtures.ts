import type { Company, CompanyDraft, CreateCompanyInput } from '../features/companies/types/company-types'
import { TEST_COMPANY_ID } from './order-fixtures'

export function companyResponse(overrides: Partial<Company> = {}): Company {
  return { id: TEST_COMPANY_ID, legalName: 'Acme Mobility Private Limited', displayName: 'Acme Mobility', contactName: 'Synthetic Contact', contactEmail: 'contact@acme.example', contactPhone: '+919800000000', billingAddress: 'Synthetic office, Bengaluru', isActive: true, createdAt: '2026-10-15T20:00:00Z', updatedAt: '2026-10-16T03:00:00Z', ...overrides }
}
export function companyInput(): CreateCompanyInput {
  const { legalName, displayName, contactName, contactEmail, contactPhone, billingAddress } = companyResponse()
  return { legalName, displayName, contactName, contactEmail, contactPhone, billingAddress, initialPayoutRate: { driverPercent: '30.00', companyPercent: '70.00' } }
}
export function companyDraft(): CompanyDraft {
  const { initialPayoutRate, ...company } = companyInput()
  return { ...company, ...initialPayoutRate }
}
export function companyList(items = [companyResponse()], totalCount = items.length, nextCursor: string | null = null) {
  return { items, pageInfo: { totalCount, hasMore: nextCursor !== null, nextCursor } }
}
export function rateResponse(overrides: Record<string, unknown> = {}) {
  return { id: '55555555-5555-4555-8555-555555555555', companyId: TEST_COMPANY_ID, driverPercent: '30.00', companyPercent: '70.00', effectiveFrom: '2026-10-15T20:00:00Z', effectiveTo: null, createdByUserId: '66666666-6666-4666-8666-666666666666', createdAt: '2026-10-15T20:00:00Z', ...overrides }
}
export function rateList(items = [rateResponse()], nextCursor: string | null = null) { return { items, pageInfo: { totalCount: items.length + (nextCursor ? 1 : 0), hasMore: nextCursor !== null, nextCursor } } }
