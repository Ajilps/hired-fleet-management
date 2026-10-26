export type Company = {
  id: string
  legalName: string
  displayName: string
  contactName: string
  contactEmail: string
  contactPhone: string
  billingAddress: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}
export type CompanyDraft = Pick<Company, 'legalName' | 'displayName' | 'contactName' | 'contactEmail' | 'contactPhone' | 'billingAddress'> & { driverPercent: string; companyPercent: string }
export type CreateCompanyInput = Omit<CompanyDraft, 'driverPercent' | 'companyPercent'> & { initialPayoutRate: { driverPercent: string; companyPercent: string } }
export type PayoutRate = { id: string; companyId: string; driverPercent: string; companyPercent: string; effectiveFrom: string; effectiveTo: string | null }
