import type { CreatePartnerInput } from '../features/companies/types/partner-types'
import { TEST_COMPANY_ID } from './order-fixtures'

export const TEST_PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const TEST_PARTNER_PASSWORD = 'Synthetic-Partner-Only!'
export function partnerInput(): CreatePartnerInput { return { email: 'partner@acme.example', fullName: 'Synthetic Partner', initialPassword: TEST_PARTNER_PASSWORD, isPrimaryContact: false } }
export function partnerResponse(companyId = TEST_COMPANY_ID) {
  return { companyId, isPrimaryContact: false, user: { id: TEST_PARTNER_ID, email: 'partner@acme.example', role: 'partner', fullName: 'Synthetic Partner', phone: null as string | null, isActive: true, companyId, driverId: null as string | null, createdAt: '2026-10-16T03:00:00Z' } }
}
export function partnerList(items = [partnerResponse()], totalCount = items.length, nextCursor: string | null = null) { return { items, pageInfo: { totalCount, hasMore: nextCursor !== null, nextCursor } } }
