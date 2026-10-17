import { Router } from 'express'
import { sendApiError } from '../../shared/http/api-error.ts'

export interface ReadinessProbe {
  checkReady(): Promise<void>
}

export function createHealthRouter(database: ReadinessProbe, isShuttingDown: () => boolean) {
  const healthRouter = Router()
  healthRouter.get('/health', (_request, response) => { response.json({ status: 'ok' }) })
  healthRouter.get('/ready', async (_request, response) => {
    if (isShuttingDown()) {
      sendApiError(response, 503, 'SERVICE_UNAVAILABLE', 'Service is shutting down.')
      return
    }
    try {
      await database.checkReady()
      response.json({ status: 'ready' })
    } catch {
      sendApiError(response, 503, 'SERVICE_UNAVAILABLE', 'Service is not ready.')
    }
  })
  return healthRouter
}
