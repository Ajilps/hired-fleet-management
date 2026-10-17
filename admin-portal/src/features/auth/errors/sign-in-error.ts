export class SignInError extends Error {
  retryAt: number | null

  constructor(message: string, retryAt: number | null = null) {
    super(message)
    this.name = 'SignInError'
    this.retryAt = retryAt
  }
}
