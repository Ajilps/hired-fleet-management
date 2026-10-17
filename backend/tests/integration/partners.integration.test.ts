import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { before, after, test } from 'node:test'
import { Client } from 'pg'
import { Router } from 'express'
import request from 'supertest'
import { createApp } from '../../src/app.ts'
import { createDatabase } from '../../src/database/database-client.ts'
import { readEnvironment } from '../../src/config/environment.ts'
import { createAuthRouter, createAdminAccount, readAuthConfig } from '../../src/modules/auth/index.ts'
import { createAuthRepository } from '../../src/modules/auth/auth-repository.ts'
import { verifyPassword } from '../../src/modules/auth/password-service.ts'
import { createCompanyRouter } from '../../src/modules/companies/index.ts'

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must identify a disposable PostgreSQL service with CREATE DATABASE permission.')
const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL })
const databaseName = `hired_partners_${randomBytes(6).toString('hex')}`
const databaseUrl = new URL(process.env.TEST_DATABASE_URL); databaseUrl.pathname = `/${databaseName}`
const database = createDatabase(readEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl.toString() }))
const auth = readAuthConfig({ AUTH_SESSION_KEY: randomBytes(32).toString('base64url'), AUTH_LOGIN_ACCOUNT_LIMIT: '100', AUTH_LOGIN_IP_LIMIT: '1000', AUTH_REFRESH_IP_LIMIT: '1000' })
const origin = 'http://localhost:5173'
const password = 'synthetic-partner-initial-password'
const nextPassword = 'synthetic-partner-changed-password'
const adminEmail = 'synthetic-partner-admin@example.test'
let app: ReturnType<typeof createApp>
let token: string
let sql: Client
let companyId: string
let otherCompanyId: string
const priorUserId = randomUUID(); const priorCompanyId = randomUUID(); const priorSessionId = randomUUID()
const root = fileURLToPath(new URL('../../', import.meta.url))
const environment = { ...process.env, DATABASE_URL: databaseUrl.toString(), MIGRATION_DATABASE_URL: databaseUrl.toString() }
before(async () => {
  await admin.connect(); await admin.query(`CREATE DATABASE "${databaseName}"`)
  sql = new Client({ connectionString: databaseUrl.toString() }); await sql.connect()
  for (const migration of ['20261017120952_create_identity_tables', '20261017125940_add_auth_session_security', '20261017134500_add_durable_commands', '20261017141500_add_companies_and_rates']) {
    await sql.query(await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8'))
    await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'resolve', '--applied', migration], { cwd: root, env: environment })
  }
  await sql.query(`INSERT INTO users (id,email,password_hash,role,full_name,created_at,updated_at) VALUES ($1,'prior-partner@example.test','synthetic-prior-hash','partner','Prior Partner',now(),now())`, [priorUserId])
  await sql.query(`INSERT INTO companies VALUES ($1,'Prior Company','Prior','Prior','prior@example.test','123','Synthetic',true,now(),now())`, [priorCompanyId])
  await sql.query('INSERT INTO company_users VALUES ($1,$2,true,now())', [priorCompanyId, priorUserId])
  await sql.query(`INSERT INTO auth_sessions (id,user_id,refresh_token_hash,expires_at,created_at) VALUES ($1,$2,'prior-refresh-hash',now()+interval '1 day',now())`, [priorSessionId, priorUserId])
  await sql.query(`INSERT INTO audit_logs (actor_user_id,entity_type,entity_id,action,created_at) VALUES ($1,'fixture',$1,'fixture.prior',now())`, [priorUserId])
  for (let deployment = 0; deployment < 2; deployment++) await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { cwd: root, env: environment })
  await createAdminAccount(database.client, { email: adminEmail, password, fullName: 'Synthetic Partner Admin' })
  const router = Router(); router.use(await createAuthRouter(database.client, auth, [origin])); router.use(createCompanyRouter(database.client, auth, randomBytes(32)))
  app = createApp({ corsOrigins: [origin] }, database, () => false, router)
  token = (await login(adminEmail).expect(200)).body.accessToken
  companyId = (await createCompany().expect(201)).body.id
  otherCompanyId = (await createCompany().expect(201)).body.id
})
after(async () => {
  await database.close(); await sql?.end().catch(() => undefined)
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`); await admin.end()
})
function input(email = `synthetic-${randomUUID()}@example.test`) { return { email, fullName: 'Synthetic Partner', initialPassword: password, isPrimaryContact: true } }
function login(email: string, credential = password) { return request(app).post('/api/v1/auth-sessions/login').send({ email, password: credential }) }
function createCompany() { return request(app).post('/api/v1/companies').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID()).send({ legalName: 'Synthetic Partner Co', displayName: 'Synthetic', contactName: 'Synthetic', contactEmail: 'contact@example.test', contactPhone: '123', billingAddress: 'Synthetic', initialPayoutRate: { driverPercent: '30.00', companyPercent: '70.00' } }) }
function provision(body = input(), key = randomUUID(), id = companyId, bearer = token) { return request(app).post(`/api/v1/companies/${id}/partners`).set('Authorization', `Bearer ${bearer}`).set('Idempotency-Key', key).send(body) }
function get(path: string, bearer = token) { return request(app).get(`/api/v1/${path}`).set('Authorization', `Bearer ${bearer}`) }
function change(bearer: string, currentPassword = password, newPassword = nextPassword) { return request(app).post('/api/v1/users/me/password').set('Authorization', `Bearer ${bearer}`).send({ currentPassword, newPassword }) }
async function counts() { return { users: await database.client.user.count(), memberships: await database.client.companyUser.count(), audit: await database.client.auditLog.count(), replay: await database.client.commandReplay.count() } }
async function readyPartner() {
  const body = input(); const created = (await provision(body).expect(201)).body
  const first = (await login(body.email).expect(200)).body
  await change(first.accessToken).expect(204)
  return { ...created, auth: (await login(body.email, nextPassword).expect(200)).body }
}

test('populated upgrade preserves memberships, sessions, hashes and audit while existing users default unrestricted', async () => {
  const user = await database.client.user.findUniqueOrThrow({ where: { id: priorUserId } })
  assert.equal(user.passwordChangeRequired, false); assert.equal(user.passwordHash, 'synthetic-prior-hash')
  assert.equal((await database.client.companyUser.findUniqueOrThrow({ where: { userId: priorUserId } })).companyId, priorCompanyId)
  assert.equal((await database.client.authSession.findUniqueOrThrow({ where: { id: priorSessionId } })).refreshTokenHash, 'prior-refresh-hash')
  assert.equal(await database.client.auditLog.count({ where: { action: 'fixture.prior' } }), 1)
  const indexes = await sql.query("SELECT indexname FROM pg_indexes WHERE tablename='company_users'")
  assert.ok(indexes.rows.some((row: { indexname: string }) => row.indexname === 'ix_company_users_company_id_created_at_user_id'))
  await request(app).get('/ready').expect(200)
})
test('provisioning normalizes email and commits safe user, membership, audit and exact replay atomically', async () => {
  const before = await counts(); const body = { ...input(), email: `UPPER-${randomUUID()}@EXAMPLE.TEST`, initialPassword: `  ${password}  ` }; const key = randomUUID()
  const first = await provision(body, key).expect(201); const replay = await provision(body, key).expect(201)
  assert.deepEqual(replay.body, first.body); assert.notEqual(replay.headers['x-request-id'], first.headers['x-request-id'])
  assert.equal(first.body.user.role, 'partner'); assert.equal(first.body.user.companyId, companyId); assert.equal(first.body.user.driverId, null)
  assert.equal(first.body.user.email, body.email.toLowerCase()); assert.equal(first.body.user.passwordChangeRequired, true)
  const stored = await database.client.user.findUniqueOrThrow({ where: { id: first.body.user.id } })
  assert.match(stored.passwordHash, /^\$argon2id\$/); assert.equal(await verifyPassword(stored.passwordHash, body.initialPassword), true)
  assert.equal(await verifyPassword(stored.passwordHash, body.initialPassword.trim()), false)
  const saved = await database.client.commandReplay.findFirstOrThrow({ where: { idempotencyKey: key } })
  const audit = await database.client.auditLog.findFirstOrThrow({ where: { entityId: stored.id } })
  for (const value of [first.body, saved.responseBody, audit.afterData, audit.beforeData]) {
    const json = JSON.stringify(value); assert.ok(!json.includes(password)); assert.ok(!json.includes(stored.passwordHash)); assert.ok(!/initialPassword|passwordHash|refreshToken|accessToken/.test(json))
  }
  assert.deepEqual(await counts(), { users: before.users + 1, memberships: before.memberships + 1, audit: before.audit + 1, replay: before.replay + 1 })
  await provision({ ...body, initialPassword: nextPassword }, key).expect(409)
})
test('strict provisioning rejects assigned role/scope/status, invalid policy and missing idempotency', async () => {
  const before = await counts(); const body = input()
  for (const extra of [{ role: 'admin' }, { companyId: otherCompanyId }, { isActive: false }, { passwordChangeRequired: false }, { initialPassword: 'short' }, { initialPassword: 'x'.repeat(129) }, { phone: '' }]) await provision({ ...body, ...extra }).expect(422)
  await request(app).post(`/api/v1/companies/${companyId}/partners`).set('Authorization', `Bearer ${token}`).send(body).expect(422)
  await provision(body, randomUUID(), randomUUID()).expect(404)
  await provision(body, randomUUID(), companyId, 'invalid').expect(401)
  assert.deepEqual(await counts(), before)
})
test('same-key races create one account; conflicting normalized emails never overwrite any role', async () => {
  const body = input(); const key = randomUUID(); const before = await counts()
  const responses = await Promise.all([provision(body, key), provision(body, key)])
  assert.ok(responses.some((response) => response.status === 201))
  assert.ok(responses.every((response) => response.status === 201 || (response.status === 409 && response.body.error.code === 'COMMAND_IN_PROGRESS')))
  await provision(body, key).expect(201)
  assert.equal((await counts()).users, before.users + 1)
  const raced = input(); const results = await Promise.all([provision(raced), provision({ ...raced, email: raced.email.toUpperCase() }, randomUUID(), otherCompanyId)])
  assert.deepEqual(results.map((response) => response.status).sort(), [201, 409])
  await provision(input(adminEmail)).expect(409)
  assert.equal((await database.client.user.findUniqueOrThrow({ where: { email: adminEmail } })).role, 'Admin')
})
test('membership or audit insertion failure rolls back user, membership and replay and allows the same retry', async () => {
  for (const table of ['company_users', 'audit_logs']) {
    const before = await counts(); const body = input(); const key = randomUUID()
    await sql.query(`CREATE FUNCTION fixture_fail_partner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic private failure'; END; $$; CREATE TRIGGER fixture_partner_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fixture_fail_partner();`)
    try { const failed = await provision(body, key).expect(500); assert.ok(!failed.text.includes('Synthetic private failure')) }
    finally { await sql.query(`DROP TRIGGER fixture_partner_failure ON ${table}; DROP FUNCTION fixture_fail_partner()`) }
    assert.deepEqual(await counts(), before)
    await provision(body, key).expect(201)
  }
})
test('partner list cursors bind actor, company and collection with exact totals and tied timestamp ordering', async () => {
  const ids = []
  for (let index = 0; index < 3; index++) ids.push((await provision().expect(201)).body.user.id as string)
  await sql.query("UPDATE company_users SET created_at='2030-01-01T00:00:00.123Z' WHERE user_id=ANY($1::uuid[])", [ids])
  ids.sort().reverse()
  const total = await database.client.companyUser.count({ where: { companyId } })
  const first = (await get(`companies/${companyId}/partners?limit=2`).expect(200)).body
  assert.deepEqual(first.items.map((row: { user: { id: string } }) => row.user.id), ids.slice(0, 2)); assert.equal(first.pageInfo.totalCount, total)
  const cursor = encodeURIComponent(first.pageInfo.nextCursor)
  const second = (await get(`companies/${companyId}/partners?limit=2&cursor=${cursor}`).expect(200)).body
  assert.equal(second.items[0].user.id, ids[2]); assert.equal(second.pageInfo.totalCount, total)
  await get(`companies/${otherCompanyId}/partners?cursor=${cursor}`).expect(422)
  await get(`companies/${companyId}/payout-rates?cursor=${cursor}`).expect(422)
  await createAdminAccount(database.client, { email: 'other-partner-admin@example.test', password, fullName: 'Synthetic Other' })
  const other = (await login('other-partner-admin@example.test').expect(200)).body.accessToken
  await get(`companies/${companyId}/partners?cursor=${cursor}`, other).expect(422)
})
test('initial credentials issue restricted identity and refresh; a verified change revokes every old session', async () => {
  const body = input(); const key = randomUUID(); const row = (await provision(body, key).expect(201)).body
  const first = (await login(body.email).expect(200)).body; const other = (await login(body.email).expect(200)).body
  assert.equal(first.user.passwordChangeRequired, true); assert.equal(first.user.companyId, companyId)
  await get('users/me', first.accessToken).expect(200)
  await get(`companies/${companyId}`, first.accessToken).expect(403).expect((response) => assert.equal(response.body.error.code, 'PASSWORD_CHANGE_REQUIRED'))
  const rotated = (await request(app).post('/api/v1/auth-sessions/refresh').send({ refreshToken: first.refreshToken }).expect(200)).body
  assert.equal(rotated.user.passwordChangeRequired, true)
  await change(first.accessToken, 'incorrect-current-password').expect(401)
  await change(first.accessToken, password, password).expect(422)
  await change(first.accessToken, password, 'short').expect(422)
  const previousHash = (await database.client.user.findUniqueOrThrow({ where: { id: row.user.id } })).passwordHash
  await change(rotated.accessToken).expect(204)
  for (const session of [first, other, rotated]) await get('users/me', session.accessToken).expect(401)
  await request(app).post('/api/v1/auth-sessions/refresh').send({ refreshToken: rotated.refreshToken }).expect(401)
  await login(body.email).expect(401)
  const signedIn = (await login(body.email, nextPassword).expect(200)).body
  assert.equal(signedIn.user.passwordChangeRequired, false)
  assert.deepEqual((await provision(body, key).expect(201)).body, row)
  await get(`companies/${companyId}`, signedIn.accessToken).expect(200)
  // A login verified before the change cannot create a session from its stale hash afterwards.
  await assert.rejects(createAuthRepository(database.client).createSession(previousHash, { id: randomUUID(), userId: row.user.id, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000), createdAt: new Date() }), { status: 401 })
  const audit = await database.client.auditLog.findMany({ where: { entityId: row.user.id, action: 'account.password_changed' } })
  assert.equal(audit.length, 1); assert.ok(!JSON.stringify(audit[0]!.afterData).includes(nextPassword))
  await get('users/me').expect(200)
})
test('browser password changes enforce the stored transport guard and clear the HttpOnly refresh cookie', async () => {
  const body = input(); await provision(body).expect(201)
  const signedIn = await request(app).post('/api/v1/auth-sessions/login').set('Origin', origin).set('X-CSRF-Guard', '1').send({ email: body.email, password, transport: 'browser' }).expect(200)
  assert.equal(signedIn.body.refreshToken, undefined)
  await change(signedIn.body.accessToken).expect(403)
  await request(app).post('/api/v1/users/me/password').set('Authorization', `Bearer ${signedIn.body.accessToken}`).set('Origin', 'https://evil.example.test').set('X-CSRF-Guard', '1').send({ currentPassword: password, newPassword: nextPassword }).expect(403)
  const changed = await request(app).post('/api/v1/users/me/password').set('Authorization', `Bearer ${signedIn.body.accessToken}`).set('Origin', origin).set('X-CSRF-Guard', '1').send({ currentPassword: password, newPassword: nextPassword }).expect(204)
  assert.match(changed.headers['set-cookie']![0]!, /HttpOnly/); assert.match(changed.headers['set-cookie']![0]!, /Expires=Thu, 01 Jan 1970/)
  await get('users/me', signedIn.body.accessToken).expect(401)
})
test('current partner scope allows only own company and hides all other company IDs and admin endpoints', async () => {
  const partner = await readyPartner(); const bearer = partner.auth.accessToken
  await get(`companies/${companyId}`, bearer).expect(200)
  await get(`companies/${otherCompanyId}`, bearer).expect(404); await get(`companies/${randomUUID()}`, bearer).expect(404)
  for (const path of ['companies', `companies/${companyId}/partners`, `companies/${companyId}/payout-rates`]) await get(path, bearer).expect(403)
  await provision(input(), randomUUID(), companyId, bearer).expect(403)
  await request(app).patch(`/api/v1/companies/${companyId}`).set('Authorization', `Bearer ${bearer}`).set('Idempotency-Key', randomUUID()).send({ isActive: false }).expect(403)
  await request(app).post(`/api/v1/companies/${companyId}/payout-rates`).set('Authorization', `Bearer ${bearer}`).set('Idempotency-Key', randomUUID()).send({ driverPercent: '50.00', companyPercent: '50.00', reason: 'Forbidden' }).expect(403)
  await database.client.user.update({ where: { id: partner.user.id }, data: { isActive: false } })
  await get(`companies/${companyId}`, bearer).expect(401)
  await database.client.user.update({ where: { id: partner.user.id }, data: { isActive: true } })
  await sql.query('UPDATE company_users SET company_id=$1 WHERE user_id=$2', [otherCompanyId, partner.user.id])
  const current = (await get('users/me', bearer).expect(200)).body; assert.equal(current.companyId, otherCompanyId)
  await get(`companies/${companyId}`, bearer).expect(404); await get(`companies/${otherCompanyId}`, bearer).expect(200)
  await sql.query('DELETE FROM company_users WHERE user_id=$1', [partner.user.id])
  await get('users/me', bearer).expect(403)
  await request(app).post('/api/v1/auth-sessions/refresh').send({ refreshToken: `${partner.auth.sessionId}.${randomBytes(32).toString('base64url')}` }).expect(401)
  await request(app).post('/api/v1/auth-sessions/refresh').send({ refreshToken: partner.auth.refreshToken }).expect(403)
})
test('deactivated companies retain own-company history access without disabling the partner account', async () => {
  const partner = await readyPartner()
  await database.client.company.update({ where: { id: companyId }, data: { isActive: false } })
  try { const result = await get(`companies/${companyId}`, partner.auth.accessToken).expect(200); assert.equal(result.body.isActive, false) }
  finally { await database.client.company.update({ where: { id: companyId }, data: { isActive: true } }) }
})
test('concurrent password changes commit once and credential mutation rolls back if audit insertion fails', async () => {
  const body = input(); const row = (await provision(body).expect(201)).body; const signedIn = (await login(body.email).expect(200)).body
  const before = await database.client.user.findUniqueOrThrow({ where: { id: row.user.id } })
  await sql.query("CREATE FUNCTION fixture_fail_password_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic password audit failure'; END; $$; CREATE TRIGGER fixture_password_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fixture_fail_password_audit();")
  try { await change(signedIn.accessToken).expect(500) }
  finally { await sql.query('DROP TRIGGER fixture_password_audit_failure ON audit_logs; DROP FUNCTION fixture_fail_password_audit()') }
  const after = await database.client.user.findUniqueOrThrow({ where: { id: row.user.id } })
  assert.equal(after.passwordHash, before.passwordHash); assert.equal(after.passwordChangeRequired, true)
  assert.equal((await database.client.authSession.findUniqueOrThrow({ where: { id: signedIn.sessionId } })).revokedAt, null)
  const results = await Promise.all([change(signedIn.accessToken), change(signedIn.accessToken)])
  assert.deepEqual(results.map((response) => response.status).sort(), [204, 401])
  assert.equal(await database.client.auditLog.count({ where: { entityId: row.user.id, action: 'account.password_changed' } }), 1)
})
test('password attempts are durably throttled per account without changing the credential', async () => {
  const body = input(); await provision(body).expect(201); const signedIn = (await login(body.email).expect(200)).body
  for (let index = 0; index < 5; index++) await change(signedIn.accessToken, 'synthetic-wrong-password').expect(401)
  const response = await change(signedIn.accessToken).expect(429)
  assert.ok(Number(response.headers['retry-after']) > 0)
  await login(body.email).expect(200)
})

test('readiness refuses an API missing the password lifecycle column and recovers after restoration', async () => {
  await sql.query('ALTER TABLE users RENAME COLUMN password_change_required TO fixture_password_change_required')
  try { await request(app).get('/ready').expect(503); await request(app).get('/health').expect(200) }
  finally { await sql.query('ALTER TABLE users RENAME COLUMN fixture_password_change_required TO password_change_required') }
  await request(app).get('/ready').expect(200)
})
