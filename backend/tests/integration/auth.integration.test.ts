import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { before, after, test } from 'node:test'
import request from 'supertest'
import { createApp } from '../../src/app.ts'
import { createDatabase } from '../../src/database/database-client.ts'
import { readEnvironment } from '../../src/config/environment.ts'
import { createAuthRouter, createAdminAccount, readAuthConfig } from '../../src/modules/auth/index.ts'

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must identify a disposable migrated database.')
const database = createDatabase(readEnvironment({ DATABASE_URL: process.env.TEST_DATABASE_URL }))
const config = readAuthConfig({ AUTH_SESSION_KEY: randomBytes(32).toString('base64url'), AUTH_LOGIN_ACCOUNT_LIMIT: '100', AUTH_LOGIN_IP_LIMIT: '1000', AUTH_REFRESH_IP_LIMIT: '1000' })
const origin = 'http://localhost:5173'
const email = `synthetic-${randomUUID()}@example.test`
const otherEmail = `synthetic-${randomUUID()}@example.test`
const password = 'synthetic-password-for-auth-tests'
let app: ReturnType<typeof createApp>
before(async () => {
  await createAdminAccount(database.client, { email, password, fullName: 'Synthetic Admin' })
  await createAdminAccount(database.client, { email: otherEmail, password, fullName: 'Second Synthetic Admin' })
  app = createApp({ corsOrigins: [origin] }, database, () => false, await createAuthRouter(database.client, config, [origin]))
})
after(async () => {
  const users = await database.client.user.findMany({ where: { email: { in: [email, otherEmail] } } })
  for (const user of users) { await database.client.authSession.deleteMany({ where: { userId: user.id } }); await database.client.user.delete({ where: { id: user.id } }) }
  await database.close()
})
function login() { return request(app).post('/api/v1/auth-sessions/login').send({ email, password }) }
function browserLogin() { return request(app).post('/api/v1/auth-sessions/login').set('Origin', origin).set('X-CSRF-Guard', '1').send({ email, password, transport: 'browser' }) }
function browserRefresh(cookie: string) { return request(app).post('/api/v1/auth-sessions/refresh').set('Origin', origin).set('X-CSRF-Guard', '1').set('Cookie', cookie).send({ transport: 'browser' }) }
function cookieOf(response: { headers: Record<string, unknown> }) { return (response.headers['set-cookie'] as string[])[0]!.split(';')[0]! }

test('bootstrap normalizes email and never overwrites an existing admin', async () => {
  await assert.rejects(createAdminAccount(database.client, { email: email.toUpperCase(), password, fullName: 'Overwrite' }))
  assert.equal((await database.client.user.findUnique({ where: { email } }))?.fullName, 'Synthetic Admin')
})
test('browser login issues a private cookie, omits refresh JSON and survives rotation', async () => {
  const signedIn = await browserLogin().expect(200)
  assert.equal(signedIn.body.refreshToken, undefined)
  assert.match(signedIn.headers['set-cookie']![0]!, /HttpOnly/)
  assert.match(signedIn.headers['set-cookie']![0]!, /SameSite=Lax/)
  const refreshed = await browserRefresh(cookieOf(signedIn)).expect(200)
  assert.notEqual(cookieOf(refreshed), cookieOf(signedIn))
  await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${refreshed.body.accessToken}`).expect(200)
  const rows = await database.client.authRefreshToken.findMany({ where: { sessionId: signedIn.body.sessionId } })
  assert.equal(rows.length, 1)
  assert.match(rows[0]!.tokenHash, /^[0-9a-f]{64}$/)
})
test('browser operations reject missing/untrusted origins and missing CSRF guard', async () => {
  await request(app).post('/api/v1/auth-sessions/login').send({ email, password, transport: 'browser' }).expect(403)
  await request(app).post('/api/v1/auth-sessions/login').set('Origin', 'https://evil.example.test').set('X-CSRF-Guard', '1').send({ email, password, transport: 'browser' }).expect(403)
  await request(app).post('/api/v1/auth-sessions/refresh').set('Origin', origin).send({ transport: 'browser' }).expect(403)
})
test('refresh reuse revokes the family and already issued access tokens', async () => {
  const signedIn = await login().expect(200)
  const refreshed = await request(app).post('/api/v1/auth-sessions/refresh').send({ refreshToken: signedIn.body.refreshToken }).expect(200)
  await request(app).post('/api/v1/auth-sessions/refresh').send({ refreshToken: signedIn.body.refreshToken }).expect(401)
  await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${refreshed.body.accessToken}`).expect(401)
})
test('simultaneous refresh requests cannot both rotate one credential', async () => {
  const signedIn = await login().expect(200)
  const responses = await Promise.all([0, 1].map(() => request(app).post('/api/v1/auth-sessions/refresh').send({ refreshToken: signedIn.body.refreshToken })))
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 401])
  await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${signedIn.body.accessToken}`).expect(401)
})
test('forged refresh secrets cannot revoke a known session', async () => {
  const signedIn = await login().expect(200)
  await request(app).post('/api/v1/auth-sessions/refresh').send({ refreshToken: `${signedIn.body.sessionId}.${randomBytes(32).toString('base64url')}` }).expect(401)
  await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${signedIn.body.accessToken}`).expect(200)
})
test('logout clears the browser cookie and immediately revokes access', async () => {
  const signedIn = await browserLogin().expect(200)
  const signedOut = await request(app).post('/api/v1/auth-sessions/logout').set('Origin', origin).set('X-CSRF-Guard', '1').set('Authorization', `Bearer ${signedIn.body.accessToken}`).send({ transport: 'browser' }).expect(204)
  assert.match(signedOut.headers['set-cookie']![0]!, /Expires=Thu, 01 Jan 1970/)
  await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${signedIn.body.accessToken}`).expect(401)
  await browserRefresh(cookieOf(signedIn)).expect(401)
})
test('disabled and expired sessions fail even with a valid signature', async () => {
  const signedIn = await login().expect(200)
  await database.client.authSession.update({ where: { id: signedIn.body.sessionId }, data: { expiresAt: new Date(0) } })
  await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${signedIn.body.accessToken}`).expect(401)
  const active = await login().expect(200)
  await database.client.user.update({ where: { email }, data: { isActive: false } })
  await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${active.body.accessToken}`).expect(401)
  await login().expect(401)
  await database.client.user.update({ where: { email }, data: { isActive: true } })
})
test('session lists hide hashes and revocation stays scoped to the user', async () => {
  const signedIn = await login().expect(200)
  const other = await request(app).post('/api/v1/auth-sessions/login').send({ email: otherEmail, password }).expect(200)
  const list = await request(app).get('/api/v1/auth-sessions?limit=1').set('Authorization', `Bearer ${signedIn.body.accessToken}`).expect(200)
  assert.equal(list.body.items.length, 1)
  assert.ok(list.body.pageInfo.totalCount > 0)
  assert.ok(!JSON.stringify(list.body).includes('Hash'))
  assert.ok(!list.body.items.some((item: { id: string }) => item.id === other.body.sessionId))
  await request(app).delete(`/api/v1/auth-sessions/${other.body.sessionId}`).set('Authorization', `Bearer ${signedIn.body.accessToken}`).expect(404)
  await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${other.body.accessToken}`).expect(200)
  await request(app).delete(`/api/v1/auth-sessions/${randomUUID()}`).set('Authorization', `Bearer ${signedIn.body.accessToken}`).expect(404)
  await request(app).delete(`/api/v1/auth-sessions/${signedIn.body.sessionId}`).set('Authorization', `Bearer ${signedIn.body.accessToken}`).expect(204)
  await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${signedIn.body.accessToken}`).expect(401)
})
test('production cookies use the Secure host-only prefix and browser tokens cannot use native refresh', async () => {
  const secureApp = createApp({ corsOrigins: [origin] }, database, () => false, await createAuthRouter(database.client, { ...config, isSecureCookie: true }, [origin]))
  const signedIn = await request(secureApp).post('/api/v1/auth-sessions/login').set('Origin', origin).set('X-CSRF-Guard', '1').send({ email, password, transport: 'browser' }).expect(200)
  const cookie = signedIn.headers['set-cookie']![0]!
  assert.match(cookie, /^__Host-hired_refresh=/)
  assert.match(cookie, /; Secure/)
  assert.match(cookie, /; Path=\//)
  assert.ok(!cookie.includes('Domain='))
  const token = decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!)
  await request(app).post('/api/v1/auth-sessions/refresh').send({ refreshToken: token }).expect(401)
  await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${signedIn.body.accessToken}`).expect(200)
})
test('durable login throttling returns Retry-After and does not require Redis', async () => {
  const limitedApp = createApp({ corsOrigins: [origin] }, database, () => false, await createAuthRouter(database.client, { ...config, key: randomBytes(32), loginAccountLimit: 1 }, [origin]))
  const attempt = () => request(limitedApp).post('/api/v1/auth-sessions/login').send({ email: `missing-${randomUUID()}@example.test`, password })
  await attempt().expect(401)
  const address = `missing-${randomUUID()}@example.test`
  await request(limitedApp).post('/api/v1/auth-sessions/login').send({ email: address, password }).expect(401)
  const blocked = await request(limitedApp).post('/api/v1/auth-sessions/login').send({ email: address, password }).expect(429)
  assert.ok(Number(blocked.headers['retry-after']) > 0)
  assert.equal(blocked.body.error.retryAfterSeconds, Number(blocked.headers['retry-after']))
})
test('non-admin roles cannot receive fabricated admin identity or a new auth session', async () => {
  const user = await database.client.user.update({ where: { email: otherEmail }, data: { role: 'Driver' } })
  try {
    const beforeCount = await database.client.authSession.count({ where: { userId: user.id } })
    await request(app).post('/api/v1/auth-sessions/login').send({ email: otherEmail, password }).expect(403)
    assert.equal(await database.client.authSession.count({ where: { userId: user.id } }), beforeCount)
  } finally { await database.client.user.update({ where: { id: user.id }, data: { role: 'Admin' } }) }
})
