import type { CreateDriverInput, DriverDraft } from '../types/driver-types'

export function validateDriverProvisioning(draft: DriverDraft, isEmailValid: boolean) {
 const errors: Partial<Record<keyof DriverDraft, string>> = {}
 if (!draft.fullName.trim() || draft.fullName.trim().length > 150) errors.fullName = 'Enter a driver name of 1–150 characters.'
 if (!draft.email.trim() || draft.email.trim().length > 255 || !isEmailValid) errors.email = 'Enter a valid email address of up to 255 characters.'
 if (!draft.phone.trim() || draft.phone.trim().length > 30) errors.phone = 'Enter a phone number of 1–30 characters.'
 if (draft.initialPassword.length < 15 || draft.initialPassword.length > 128) errors.initialPassword = 'Enter an initial password of 15–128 characters.'
 if (draft.homeAddress.trim().length > 2000) errors.homeAddress = 'Use 2,000 characters or fewer.'
 const date = draft.dateOfBirth
 if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > new Date().toISOString().slice(0, 10))) errors.dateOfBirth = 'Choose a valid birth date that is not in the future.'
 for (const key of ['fullName', 'phone', 'homeAddress'] as const) if (draft[key].includes('\0')) errors[key] = 'Remove unsupported characters.'
 const input: CreateDriverInput | null = Object.keys(errors).length ? null : { fullName: draft.fullName.trim(), email: draft.email.trim().toLowerCase(), phone: draft.phone.trim(), initialPassword: draft.initialPassword, ...(date ? { dateOfBirth: date } : {}), ...(draft.homeAddress.trim() ? { homeAddress: draft.homeAddress.trim() } : {}) }
 return { errors, input }
}
