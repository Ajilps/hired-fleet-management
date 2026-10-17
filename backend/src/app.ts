import { randomUUID } from 'node:crypto'
import express from 'express'
import type { ErrorRequestHandler, Router } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import type { Environment } from './config/environment.ts'
import { createHealthRouter } from './modules/health/health-routes.ts'
import type { ReadinessProbe } from './modules/health/health-routes.ts'
import { sendApiError } from './shared/http/api-error.ts'
import { HttpError } from './shared/http/http-error.ts'

export function createApp(config: Pick<Environment, 'corsOrigins'>, database: ReadinessProbe, isShuttingDown = () => false, apiRouter?: Router) {
  const app = express()
  app.disable('x-powered-by')
  app.disable('etag')
  app.use((_request, response, next) => {
    // Generate server IDs; do not trust or log arbitrary client-provided values.
    response.locals.requestId = randomUUID()
    response.setHeader('X-Request-Id', response.locals.requestId as string)
    response.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use(helmet())
  app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'If-Match', 'Idempotency-Key', 'X-CSRF-Guard'],
    exposedHeaders: ['X-Request-Id', 'ETag', 'Retry-After'],
    maxAge: 600,
  }))
  app.use(express.json({ limit: '64kb', strict: true }))
  app.use(createHealthRouter(database, isShuttingDown))
  if (apiRouter) app.use('/api/v1', apiRouter)
  app.use((_request, response) => { sendApiError(response, 404, 'NOT_FOUND', 'Route not found.') })
  const handleError: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.headersSent) { next(error); return }
    if (error instanceof HttpError) {
      if (error.retryAfterSeconds !== null) response.setHeader('Retry-After', error.retryAfterSeconds)
      sendApiError(response, error.status, error.code, error.message, error.retryAfterSeconds)
      return
    }
    const type = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined
    if (type === 'entity.parse.failed') sendApiError(response, 400, 'VALIDATION_FAILED', 'Request body must be valid JSON.')
    else if (type === 'entity.too.large') sendApiError(response, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.')
    else sendApiError(response, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  }
  app.use(handleError)
  return app
}
