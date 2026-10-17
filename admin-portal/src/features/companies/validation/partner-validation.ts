import type { CreatePartnerInput, PartnerDraft } from '../types/partner-types'

export function validatePartner(draft: PartnerDraft, isEmailValid: boolean) {
  const errors: Partial<Record<keyof PartnerDraft, string>> = {}
  if (!draft.fullName.trim() || draft.fullName.trim().length > 150) errors.fullName = 'Enter a partner name of 1–150 characters.'
  if (!draft.email.trim() || draft.email.trim().length > 255 || !isEmailValid) errors.email = 'Enter a valid email address of up to 255 characters.'
  if (draft.phone.trim().length > 30) errors.phone = 'Use 30 characters or fewer for the phone number.'
  // Passwords are opaque: do not trim, normalize or invent an unresolved password policy.
  if (!draft.initialPassword.length || draft.initialPassword.length > 1024) errors.initialPassword = 'Enter an initial password of 1–1024 characters.'
  const input: CreatePartnerInput | null = Object.keys(errors).length ? null : {
    fullName: draft.fullName.trim(), email: draft.email.trim(), ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
    initialPassword: draft.initialPassword, isPrimaryContact: draft.isPrimaryContact,
  }
  return { errors, input }
}
