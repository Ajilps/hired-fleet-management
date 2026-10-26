import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import { readAuthConfig } from '../src/modules/auth/auth-config.ts'
import { bootstrapSchema, loginSchema, refreshSchema, validate } from '../src/modules/auth/auth-validator.ts'
import { hashPassword, verifyPassword } from '../src/modules/auth/password-service.ts'
import { signAccessToken, verifyAccessToken } from '../src/modules/auth/token-service.ts'

test('auth configuration rejects missing/weak secrets without logging values', () => {
  for (const value of [undefined, 'secret', 'private-test-key']) assert.throws(() => readAuthConfig({ AUTH_SESSION_KEY: value }), /Invalid authentication configuration/)
})
test('strict auth DTOs normalize identifiers and keep passwords unchanged', () => {
  assert.equal(validate(loginSchema, { email: 'ADMIN@example.test', password: ' spaces stay ' }).email, 'admin@example.test')
  assert.equal(validate(loginSchema, { email: 'admin@example.test', password: ' spaces stay ' }).password, ' spaces stay ')
  assert.throws(() => validate(loginSchema, { email: 'admin@example.test', password: 'x', role: 'admin' }))
  assert.throws(() => validate(bootstrapSchema, { email: 'admin@example.test', fullName: 'Admin', password: 'short' }))
  assert.throws(() => validate(refreshSchema, { transport: 'browser', refreshToken: 'not-allowed' }))
})
test('password hashes use Argon2id and reject the wrong password', async () => {
  const passwordHash = await hashPassword('synthetic-password-for-testing')
  assert.match(passwordHash, /^\$argon2id\$/)
  assert.equal(await verifyPassword(passwordHash, 'synthetic-password-for-testing'), true)
  assert.equal(await verifyPassword(passwordHash, 'wrong'), false)
})
test('access tokens enforce expiry, signature, issuer and session identity', async () => {
  const config = readAuthConfig({ AUTH_SESSION_KEY: randomBytes(32).toString('base64url') })
  const userId = '11111111-1111-4111-8111-111111111111'
  const sessionId = '22222222-2222-4222-8222-222222222222'
  const token = await signAccessToken(userId, sessionId, new Date(Date.now() + 60_000), config)
  assert.deepEqual(await verifyAccessToken(token, config), { userId, sessionId })
  await assert.rejects(verifyAccessToken(token + 'x', config))
  await assert.rejects(verifyAccessToken(await signAccessToken(userId, sessionId, new Date(0), config), config))
})
