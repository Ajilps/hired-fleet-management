export type CreatePartnerInput = { email: string; fullName: string; phone?: string; initialPassword: string; isPrimaryContact: boolean }
export type PartnerDraft = Required<CreatePartnerInput>
export type CompanyPartner = {
  companyId: string
  isPrimaryContact: boolean
  user: { id: string; email: string; fullName: string; phone: string | null; isActive: boolean; createdAt: string }
}
