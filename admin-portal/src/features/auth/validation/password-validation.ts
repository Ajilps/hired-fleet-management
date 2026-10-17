export type PasswordDraft = { currentPassword: string; newPassword: string; confirmation: string }
export function validatePasswordChange(input: PasswordDraft) {
  const errors: Partial<Record<keyof PasswordDraft, string>> = {}
  if (!input.currentPassword.length || input.currentPassword.length > 1024) errors.currentPassword = 'Enter your current password.'
  if (input.newPassword.length < 15 || input.newPassword.length > 128) errors.newPassword = 'Use 15–128 characters for your new password.'
  else if (input.newPassword === input.currentPassword) errors.newPassword = 'Choose a different password.'
  if (input.confirmation !== input.newPassword) errors.confirmation = 'The new passwords must match.'
  return errors
}
