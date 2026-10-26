type LoginFieldErrors = { email?: string; password?: string }

export function validateLoginForm(email: string, password: string, isEmailValid: boolean): LoginFieldErrors {
  const errors: LoginFieldErrors = {}
  if (!email) errors.email = 'Enter your email address.'
  else if (!isEmailValid) errors.email = 'Enter a valid email address.'
  if (!password) errors.password = 'Enter your password.'
  return errors
}
