import type { Response } from 'express'

export function sendApiError(response: Response, status: number, code: string, message: string, retryAfterSeconds: number | null = null) {
  response.status(status).json({ error: {
    code, message, requestId: response.locals.requestId,
    details: [], retryAfterSeconds,
  } })
}
