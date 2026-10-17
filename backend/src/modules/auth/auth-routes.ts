import { Router } from 'express'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { AuthConfig } from './auth-config.ts'
import { createAuthRepository } from './auth-repository.ts'
import { createAuthService } from './auth-service.ts'
import { createAuthController } from './auth-controller.ts'

export async function createAuthRouter(client: PrismaClient, config: AuthConfig, origins: string[]) {
  const controller = createAuthController(await createAuthService(createAuthRepository(client), config), config, origins)
  const authRouter = Router()
  authRouter.post('/auth-sessions/login', controller.login)
  authRouter.post('/auth-sessions/refresh', controller.refresh)
  authRouter.post('/auth-sessions/logout', controller.logout)
  authRouter.get('/auth-sessions', controller.listSessions)
  authRouter.delete('/auth-sessions/:sessionId', controller.revokeSession)
  authRouter.get('/users/me', controller.currentUser)
  authRouter.post('/users/me/password', controller.changePassword)
  return authRouter
}
