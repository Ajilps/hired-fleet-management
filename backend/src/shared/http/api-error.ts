import type { Response } from 'express'

export function sendApiError(response: Response, status: number, code: string, message: string) {
  response.status(status).json({ error: {
    code, message, requestId: response.locals.requestId,
    details: [], retryAfterSeconds: null,
  } })
}
