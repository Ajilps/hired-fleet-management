import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { AuthConfig } from './auth-config.ts'
import { HttpError } from '../../shared/http/http-error.ts'

export function hashToken(token: string) { return createHash('sha256').update(token).digest('hex') }
export function createRefreshToken(sessionId: string) { return `${sessionId}.${randomBytes(32).toString('base64url')}` }
export async function signAccessToken(userId: string, sessionId: string, expiresAt: Date, config: AuthConfig) {
  return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId).setIssuer('hired-api').setAudience('hired-clients')
    .setIssuedAt().setJti(randomUUID()).setExpirationTime(Math.floor(expiresAt.getTime() / 1000)).sign(config.key)
}
export async function verifyAccessToken(token: string, config: AuthConfig) {
  try {
    const { payload } = await jwtVerify(token, config.key, { algorithms: ['HS256'], issuer: 'hired-api', audience: 'hired-clients', typ: 'JWT', requiredClaims: ['sub', 'sid', 'exp', 'iat', 'jti'] })
    if (typeof payload.sid !== 'string' || typeof payload.sub !== 'string' || !/^[0-9a-f-]{36}$/.test(payload.sid) || !/^[0-9a-f-]{36}$/.test(payload.sub)) throw new Error('Invalid claims')
    return { sessionId: payload.sid, userId: payload.sub }
  } catch { throw new HttpError(401, 'UNAUTHORIZED', 'The session is invalid or expired.') }
}
