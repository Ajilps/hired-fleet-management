export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfterSeconds: number | null = null) {
    super(message)
  }
}
