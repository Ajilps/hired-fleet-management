import { SignInError } from './sign-in-error'

export class PasswordChangeError extends SignInError {
  readonly isUncertain: boolean
  constructor(message: string, isUncertain = false, retryAt: number | null = null) {
    super(message, retryAt)
    this.name = 'PasswordChangeError'
    this.isUncertain = isUncertain
  }
}
