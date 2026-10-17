import type { Request, Response } from 'express'
import { parseCookie } from 'cookie'
import { z } from 'zod'
import type { AuthConfig } from './auth-config.ts'
import type { AuthService } from './auth-service.ts'
import { userDto } from './user-identity.ts'
import { loginSchema, refreshSchema, changePasswordSchema, validate } from './auth-validator.ts'
import { HttpError } from '../../shared/http/http-error.ts'

export function createAuthController(service: AuthService, config: AuthConfig, origins: string[]) {
  const cookieName = config.isSecureCookie ? '__Host-hired_refresh' : 'hired_refresh'
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, path: config.isSecureCookie ? '/' : '/api/v1/auth-sessions' }
  function browserGuard(request: Request) {
    if (!origins.includes(request.get('Origin') ?? '') || request.get('X-CSRF-Guard') !== '1') throw new HttpError(403, 'FORBIDDEN', 'Browser origin or CSRF protection is invalid.')
  }
  function clearCookie(response: Response) { response.clearCookie(cookieName, { ...cookieOptions, secure: config.isSecureCookie }) }
  async function principal(request: Request) {
    const match = /^Bearer ([^ ]+)$/.exec(request.get('Authorization') ?? '')
    if (!match) throw new HttpError(401, 'UNAUTHORIZED', 'A bearer session is required.')
    return service.authenticate(match[1]!)
  }
  function sendTokens(response: Response, result: Awaited<ReturnType<AuthService['login']>>, transport: 'browser' | 'token') {
    if (transport === 'browser') response.cookie(cookieName, result.refreshToken, { ...cookieOptions, secure: config.isSecureCookie, expires: result.refreshExpiresAt })
    response.json(result.body)
  }
  return {
    async login(request: Request, response: Response) {
      const input = validate(loginSchema, request.body)
      if (input.transport === 'browser') browserGuard(request)
      sendTokens(response, await service.login(input, request.ip ?? 'unknown'), input.transport)
    },
    async refresh(request: Request, response: Response) {
      const input = validate(refreshSchema, request.body)
      const transport = input.transport === 'browser' ? 'browser' : 'token'
      let token: string
      if (input.transport === 'browser') {
        browserGuard(request)
        token = parseCookie(request.get('Cookie') ?? '')[cookieName] ?? ''
      } else token = input.refreshToken
      try { sendTokens(response, await service.refresh(token, transport, request.ip ?? 'unknown'), transport) }
      catch (error) { if (transport === 'browser' && error instanceof HttpError && error.status === 401) clearCookie(response); throw error }
    },
    async logout(request: Request, response: Response) {
      if (request.body !== undefined) validate(z.strictObject({ transport: z.literal('browser') }), request.body)
      // Cookie clearing requires the browser guard even when the bearer expired.
      const isBrowser = request.body?.transport === 'browser'
      if (isBrowser) browserGuard(request)
      try {
        const session = await principal(request)
        if (session.transport === 'browser' && !isBrowser) throw new HttpError(403, 'FORBIDDEN', 'Browser logout requires CSRF protection.')
        await service.revoke(session.id, session.userId)
        if (isBrowser) clearCookie(response)
        response.sendStatus(204)
      } catch (error) { if (isBrowser && error instanceof HttpError && error.status === 401) clearCookie(response); throw error }
    },
    async changePassword(request: Request, response: Response) {
      const session = await principal(request)
      if (session.transport === 'browser') browserGuard(request)
      const input = validate(changePasswordSchema, request.body)
      await service.changePassword(session, input, request.ip ?? 'unknown', response.locals.requestId as string)
      if (session.transport === 'browser') clearCookie(response)
      response.sendStatus(204)
    },
    async currentUser(request: Request, response: Response) { response.json(userDto((await principal(request)).user)) },
    async listSessions(request: Request, response: Response) {
      const session = await principal(request)
      const query = validate(z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.uuid().optional() }), request.query)
      const result = await service.list(session.userId, query.limit, query.cursor)
      const hasMore = result.items.length > query.limit
      const items = result.items.slice(0, query.limit)
      response.json({ items: items.map((item) => ({ id: item.id, deviceName: item.deviceName, createdAt: item.createdAt.toISOString(), expiresAt: item.expiresAt.toISOString(), isCurrent: item.id === session.id })), pageInfo: { totalCount: result.totalCount, hasMore, nextCursor: hasMore ? items.at(-1)!.id : null } })
    },
    async revokeSession(request: Request, response: Response) {
      const session = await principal(request)
      const id = validate(z.uuid(), request.params.sessionId)
      const result = await service.revoke(id, session.userId)
      if (!result.count) throw new HttpError(404, 'NOT_FOUND', 'Session not found.')
      response.sendStatus(204)
    },
  }
}
