import type { CompanyDraft, CreateCompanyInput } from '../types/company-types'

// Integer hundredths of a percentage point; no floating-point financial arithmetic.
export function percentPoints(value: string): number | null {
  const match = /^(0|[1-9]\d?|100)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const points = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return points > 0 && points < 10000 ? points : null
}
function decimalPercent(points: number): string { return `${Math.floor(points / 100)}.${String(points % 100).padStart(2, '0')}` }
export function validateSplit(driver: string, company: string) {
  const driverPoints = percentPoints(driver)
  const companyPoints = percentPoints(company)
  if (driverPoints === null || companyPoints === null || driverPoints + companyPoints !== 10000) return null
  return { driverPercent: decimalPercent(driverPoints), companyPercent: decimalPercent(companyPoints) }
}
export function splitPreview(driver: string, company: string) {
  const split = validateSplit(driver, company)
  if (!split) return null
  // On a fixed ₹10,000 example each hundredth-percent equals exactly one rupee.
  const format = (value: string) => `₹${BigInt(value.replace('.', '')).toLocaleString('en-IN')}.00`
  return { driver: format(split.driverPercent), company: format(split.companyPercent) }
}
export function validateCompany(draft: CompanyDraft, isEmailValid: boolean): { errors: Partial<Record<keyof CompanyDraft, string>>; input: CreateCompanyInput | null } {
  const errors: Partial<Record<keyof CompanyDraft, string>> = {}
  const limits = { legalName: 200, displayName: 200, contactName: 150, contactEmail: 255, contactPhone: 30, billingAddress: 4000 }
  for (const [field, limit] of Object.entries(limits)) {
    const key = field as keyof typeof limits
    if (!draft[key].trim()) errors[key] = 'Enter a value for this required field.'
    else if (draft[key].trim().length > limit) errors[key] = `Use ${limit} characters or fewer.`
  }
  if (draft.contactEmail.trim() && !isEmailValid) errors.contactEmail = 'Enter a valid email address.'
  for (const key of ['driverPercent', 'companyPercent'] as const) {
    if (percentPoints(draft[key]) === null) errors[key] = 'Enter a percentage greater than 0 and less than 100, with at most two decimal places.'
  }
  const initialPayoutRate = validateSplit(draft.driverPercent, draft.companyPercent)
  if (!initialPayoutRate && !errors.driverPercent && !errors.companyPercent) errors.companyPercent = 'Driver and company shares must total exactly 100.00%.'
  if (Object.keys(errors).length || !initialPayoutRate) return { errors, input: null }
  return { errors, input: { legalName: draft.legalName.trim(), displayName: draft.displayName.trim(), contactName: draft.contactName.trim(), contactEmail: draft.contactEmail.trim(), contactPhone: draft.contactPhone.trim(), billingAddress: draft.billingAddress.trim(), initialPayoutRate } }
}
export function safeCompaniesReturn(value: string | null): string {
  return value === '/companies' || value?.startsWith('/companies?') ? value : '/companies'
}
