import type { Company, CompanyPayoutRate } from '../../generated/prisma/client.ts'

export function companyDto(company: Company) {
  return { id: company.id, legalName: company.legalName, displayName: company.displayName, contactName: company.contactName, contactEmail: company.contactEmail, contactPhone: company.contactPhone, billingAddress: company.billingAddress, isActive: company.isActive, createdAt: company.createdAt.toISOString(), updatedAt: company.updatedAt.toISOString() }
}
export function rateDto(rate: CompanyPayoutRate) {
  return { id: rate.id, companyId: rate.companyId, driverPercent: rate.driverPercent.toFixed(2), companyPercent: rate.companyPercent.toFixed(2), effectiveFrom: rate.effectiveFrom.toISOString(), effectiveTo: rate.effectiveTo?.toISOString() ?? null, createdByUserId: rate.createdByUserId, createdAt: rate.createdAt.toISOString() }
}
