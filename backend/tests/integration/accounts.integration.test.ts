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
import { createAuthRouter, readAuthConfig } from '../../src/modules/auth/index.ts'
import { hashPassword } from '../../src/modules/auth/password-service.ts'
import { signAccessToken, createRefreshToken, hashToken } from '../../src/modules/auth/token-service.ts'
import { createAccountRouter } from '../../src/modules/accounts/index.ts'
import { createCompanyRouter } from '../../src/modules/companies/index.ts'

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must identify a disposable PostgreSQL service with CREATE DATABASE permission.')
const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL })
const databaseName = `hired_accounts_${randomBytes(6).toString('hex')}`
const databaseUrl = new URL(process.env.TEST_DATABASE_URL); databaseUrl.pathname = `/${databaseName}`
const database = createDatabase(readEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl.toString() }))
const auth = readAuthConfig({ AUTH_SESSION_KEY: randomBytes(32).toString('base64url'), AUTH_LOGIN_ACCOUNT_LIMIT: '100', AUTH_LOGIN_IP_LIMIT: '1000' })
const password = 'synthetic-account-initial-password'; const nextPassword = 'synthetic-account-new-password'
const adminA = randomUUID(); const adminB = randomUUID()
let tokenA: string; let tokenB: string
let app: ReturnType<typeof createApp>; let sql: Client; let passwordHash: string
const root = fileURLToPath(new URL('../../', import.meta.url))
const environment = { ...process.env, DATABASE_URL: databaseUrl.toString(), MIGRATION_DATABASE_URL: databaseUrl.toString() }
before(async () => {
  await admin.connect(); await admin.query(`CREATE DATABASE "${databaseName}"`)
  sql = new Client({ connectionString: databaseUrl.toString() }); await sql.connect()
  for (const migration of ['20261017120952_create_identity_tables', '20261017125940_add_auth_session_security', '20261017134500_add_durable_commands', '20261017141500_add_companies_and_rates', '20261017152000_add_partner_password_lifecycle']) {
    await sql.query(await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8'))
    await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'resolve', '--applied', migration], { cwd: root, env: environment })
  }
  passwordHash = await hashPassword(password)
  for (const id of [adminA, adminB]) await sql.query(`INSERT INTO users (id,email,password_hash,role,full_name,created_at,updated_at) VALUES ($1,$2,$3,'admin','Synthetic Admin','2026-01-01T00:00:00.123456Z',now())`, [id, `synthetic-${id}@example.test`, passwordHash])
  await sql.query(`INSERT INTO audit_logs (actor_user_id,entity_type,entity_id,action,created_at) VALUES ($1,'fixture',$1,'fixture.prior',now())`, [adminA])
  for (let deployment = 0; deployment < 2; deployment++) await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { cwd: root, env: environment })
  const router = Router(); router.use(await createAuthRouter(database.client, auth, [])); router.use(createAccountRouter(database.client, auth, randomBytes(32))); router.use(createCompanyRouter(database.client, auth, randomBytes(32)))
  app = createApp({ corsOrigins: [] }, database, () => false, router)
  tokenA = (await session(adminA)).token; tokenB = (await session(adminB)).token
})
after(async () => {
  await database.close(); await sql?.end().catch(() => undefined)
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`); await admin.end()
})
async function session(userId: string, transport = 'token') {
  const id = randomUUID(); const refreshToken = createRefreshToken(id); const expiresAt = new Date(Date.now() + 3_600_000)
  await database.client.authSession.create({ data: { id, userId, transport, refreshTokenHash: hashToken(refreshToken), expiresAt, createdAt: new Date() } })
  return { token: await signAccessToken(userId, id, expiresAt, auth), refreshToken, sessionId: id }
}
function input(email = `synthetic-new-${randomUUID()}@example.test`) { return { email, fullName: 'Synthetic New Admin', role: 'admin', initialPassword: password } }
function create(body = input(), key = randomUUID(), token = tokenA) { return request(app).post('/api/v1/users').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body) }
function get(path: string, token = tokenA) { return request(app).get(`/api/v1/${path}`).set('Authorization', `Bearer ${token}`) }
function status(id: string, isActive: boolean, token = tokenA, key = randomUUID(), reason = 'Synthetic status change') { return request(app).patch(`/api/v1/users/${id}/status`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send({ isActive, reason }) }
async function counts() { return { users: await database.client.user.count(), audit: await database.client.auditLog.count(), replay: await database.client.commandReplay.count() } }
async function fixture(role: 'Admin' | 'Partner' | 'Driver', required = false) {
  const id = randomUUID()
  return database.client.user.create({ data: { id, email: `synthetic-${id}@example.test`, fullName: 'Synthetic Fixture', role, passwordHash, passwordChangeRequired: required, createdAt: new Date(), updatedAt: new Date() } })
}
async function withAdmins(ids: string[], run: () => Promise<void>) {
  const before = await database.client.user.findMany({ where: { role: 'Admin' }, select: { id: true, isActive: true } })
  await sql.query("UPDATE users SET is_active=(id=ANY($1::uuid[])) WHERE role='admin'", [ids])
  try { await run() } finally {
    for (const user of before) await database.client.user.update({ where: { id: user.id }, data: { isActive: user.isActive } })
    tokenA = (await session(adminA)).token; tokenB = (await session(adminB)).token
  }
}

test('user-directory migration preserves account credentials, restrictions, microseconds and audit', async () => {
  assert.equal((await database.client.user.findUniqueOrThrow({ where: { id: adminA } })).passwordHash, passwordHash)
  assert.equal((await database.client.user.findUniqueOrThrow({ where: { id: adminA } })).passwordChangeRequired, false)
  const original = await sql.query("SELECT to_char(created_at AT TIME ZONE 'UTC','SS.US') AS stamp FROM users WHERE id=$1", [adminA]); assert.equal(original.rows[0].stamp, '00.123456')
  assert.equal(await database.client.auditLog.count({ where: { action: 'fixture.prior' } }), 1)
  assert.equal((await sql.query("SELECT 1 FROM pg_indexes WHERE indexname='ix_users_created_at_id'")).rowCount, 1)
  await request(app).get('/ready').expect(200)
})
test('admin creation is normalized, restricted, atomic, audited and safely replayable after a password change', async () => {
  const before = await counts(); const body = input(`UPPER-${randomUUID()}@EXAMPLE.TEST`); const key = randomUUID()
  const saved = await create(body, key).expect(201); assert.equal(saved.body.email, body.email.toLowerCase()); assert.equal(saved.body.passwordChangeRequired, true)
  assert.equal(saved.headers.location, `/api/v1/users/${saved.body.id}`)
  assert.deepEqual((await create(body, key).expect(201)).body, saved.body)
  assert.deepEqual(await counts(), { users: before.users + 1, audit: before.audit + 1, replay: before.replay + 1 })
  const login = (await request(app).post('/api/v1/auth-sessions/login').send({ email: body.email, password }).expect(200)).body
  for (const path of ['users', `users/${saved.body.id}`, 'companies']) await get(path, login.accessToken).expect(403)
  await create(input(), randomUUID(), login.accessToken).expect(403)
  await status(adminB, false, login.accessToken).expect(403)
  await request(app).post('/api/v1/users/me/password').set('Authorization', `Bearer ${login.accessToken}`).send({ currentPassword: password, newPassword: nextPassword }).expect(204)
  await get('users/me', login.accessToken).expect(401)
  const fresh = (await request(app).post('/api/v1/auth-sessions/login').send({ email: body.email, password: nextPassword }).expect(200)).body
  await get('users', fresh.accessToken).expect(200)
  assert.deepEqual((await create(body, key).expect(201)).body, saved.body)
  const replay = await database.client.commandReplay.findFirstOrThrow({ where: { idempotencyKey: key } })
  const audit = await database.client.auditLog.findFirstOrThrow({ where: { entityId: saved.body.id, action: 'admin.provisioned' } })
  for (const value of [saved.body, replay.responseBody, audit.afterData]) { const json = JSON.stringify(value); assert.ok(!json.includes(password)); assert.ok(!/passwordHash|initialPassword|accessToken|refreshToken/.test(json)) }
})
test('invalid account create/status/query fields cannot assign scope, role, restriction or operational driver status', async () => {
  const before = await counts(); const body = input()
  for (const extra of [{ role: 'partner' }, { companyId: randomUUID() }, { isActive: false }, { passwordChangeRequired: false }, { initialPassword: 'short' }, { initialPassword: 'x'.repeat(129) }]) await create({ ...body, ...extra }).expect(422)
  await request(app).post('/api/v1/users').set('Authorization', `Bearer ${tokenA}`).send(body).expect(422)
  await request(app).patch(`/api/v1/users/${adminB}/status`).set('Authorization', `Bearer ${tokenA}`).set('Idempotency-Key', randomUUID()).send({ isActive: false, reason: 'Synthetic', driverStatus: 'active' }).expect(422)
  for (const query of ['role=Admin', 'limit=101', 'isActive=true', 'search=unknown']) await get(`users?${query}`).expect(422)
  await status(randomUUID(), false).expect(404)
  assert.deepEqual(await counts(), before)
})
test('racing duplicate admin creation creates once and distinct normalized-email intents cannot overwrite accounts', async () => {
  const body = input(); const key = randomUUID(); const before = await counts()
  const responses = await Promise.all([create(body, key), create(body, key)])
  assert.ok(responses.some((response) => response.status === 201)); assert.ok(responses.every((response) => [201, 409].includes(response.status)))
  await create(body, key).expect(201); assert.equal((await counts()).users, before.users + 1)
  const second = input(); const results = await Promise.all([create(second), create({ ...second, email: second.email.toUpperCase() })]); assert.deepEqual(results.map((value) => value.status).sort(), [201, 409])
  await create({ ...body, fullName: 'Changed intent' }, key).expect(409)
  await create(input(`synthetic-${adminA}@example.test`)).expect(409)
})
test('all-account management DTOs expose actual nullable scope without granting driver/orphan partner authentication', async () => {
  for (const role of ['Partner', 'Driver'] as const) {
    const user = await fixture(role)
    const record = (await get(`users/${user.id}`).expect(200)).body
    assert.equal(record.role, role.toLowerCase()); assert.equal(record.companyId, null); assert.equal(record.driverId, null)
    assert.equal(record.passwordHash, undefined)
    await request(app).post('/api/v1/auth-sessions/login').send({ email: user.email, password }).expect(403)
    const bearer = (await session(user.id)).token
    for (const path of ['users', `users/${user.id}`]) await get(path, bearer).expect(403)
    await create(input(), randomUUID(), bearer).expect(403); await status(adminA, false, bearer).expect(403)
  }
})
test('signed account cursors retain timestamp microseconds, all ties, role-filter totals and actor scope', async () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()].sort().reverse()
  for (let index = 0; index < ids.length; index++) await sql.query(`INSERT INTO users (id,email,password_hash,role,full_name,created_at,updated_at) VALUES ($1,$2,$3,'admin','Synthetic Microsecond',$4::timestamptz,now())`, [ids[index], `synthetic-${ids[index]}@example.test`, passwordHash, index < 2 ? '2030-01-01T00:00:00.123999Z' : '2030-01-01T00:00:00.123001Z'])
  let cursor = ''; const received: string[] = []; const total = await database.client.user.count({ where: { role: 'Admin' } })
  for (let page = 0; page < 3; page++) {
    const result = (await get(`users?role=admin&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`).expect(200)).body
    assert.equal(result.pageInfo.totalCount, total); received.push(result.items[0].id); cursor = result.pageInfo.nextCursor
  }
  assert.deepEqual(received, ids)
  const encoded = encodeURIComponent(cursor)
  await get(`users?role=partner&cursor=${encoded}`).expect(422)
  await get(`users?role=admin&cursor=${encoded}`, tokenB).expect(422)
  await get(`companies?cursor=${encoded}`).expect(422)
  const drivers = (await get('users?role=driver').expect(200)).body; assert.equal(drivers.pageInfo.totalCount, await database.client.user.count({ where: { role: 'Driver' } }))
})
test('disabling atomically revokes all transports; enabling never resurrects old sessions or changes memberships', async () => {
  const user = await fixture('Partner'); const companyId = randomUUID()
  await sql.query(`INSERT INTO companies VALUES ($1,'Synthetic','Synthetic','Synthetic','synthetic@example.test','123','Synthetic',true,now(),now())`, [companyId])
  await sql.query('INSERT INTO company_users VALUES ($1,$2,true,now())', [companyId, user.id])
  const native = await session(user.id); const browser = await session(user.id, 'browser'); const key = randomUUID()
  const saved = await status(user.id, false, tokenA, key).expect(200); assert.equal(saved.body.isActive, false); assert.equal(saved.body.companyId, companyId)
  assert.deepEqual((await status(user.id, false, tokenA, key).expect(200)).body, saved.body)
  for (const value of [native, browser]) await get('users/me', value.token).expect(401)
  await request(app).post('/api/v1/auth-sessions/refresh').send({ refreshToken: native.refreshToken }).expect(401)
  await request(app).post('/api/v1/auth-sessions/login').send({ email: user.email, password }).expect(401)
  await status(user.id, true).expect(200)
  for (const value of [native, browser]) await get('users/me', value.token).expect(401)
  assert.equal((await database.client.companyUser.findUniqueOrThrow({ where: { userId: user.id } })).companyId, companyId)
  assert.equal((await database.client.company.findUniqueOrThrow({ where: { id: companyId } })).isActive, true)
  assert.equal(await database.client.auditLog.count({ where: { entityId: user.id, action: 'account.disabled' } }), 1)
})
test('status replay returns the recorded outcome before new state checks and changed intent conflicts', async () => {
  const user = await fixture('Admin'); const key = randomUUID()
  const first = (await status(user.id, false, tokenA, key).expect(200)).body
  await status(user.id, true).expect(200)
  assert.deepEqual((await status(user.id, false, tokenA, key).expect(200)).body, first)
  assert.equal((await database.client.user.findUniqueOrThrow({ where: { id: user.id } })).isActive, true)
  await status(user.id, false, tokenA, key, 'Changed reason').expect(409)
  assert.equal(await database.client.auditLog.count({ where: { entityId: user.id, action: 'account.disabled' } }), 1)
})
test('the final usable admin stays enabled even when another enabled admin has not completed password setup', async () => {
  const restricted = await fixture('Admin', true)
  await withAdmins([adminA, restricted.id], async () => {
    const before = await counts(); const denied = await status(adminA, false).expect(409)
    assert.equal(denied.body.error.code, 'LAST_ACTIVE_ADMIN'); assert.deepEqual(await counts(), before)
    await status(restricted.id, false).expect(200)
  })
})
test('self-disable is allowed with another usable admin and immediately prevents authorized replay by the old session', async () => {
  await withAdmins([adminA, adminB], async () => {
    const key = randomUUID(); const actor = tokenA
    const saved = (await status(adminA, false, actor, key).expect(200)).body
    await status(adminA, false, actor, key).expect(401)
    await get('users', actor).expect(401); await get('users', tokenB).expect(200)
    await status(adminA, true, tokenB).expect(200)
    await get('users', actor).expect(401)
    const fresh = (await session(adminA)).token
    assert.deepEqual((await status(adminA, false, fresh, key).expect(200)).body, saved)
    await get('users', fresh).expect(200)
  })
})
test('simultaneous self-disables preserve one usable admin and avoid actor lock-upgrade deadlocks', async () => {
  await withAdmins([adminA, adminB], async () => {
    const results = await Promise.all([status(adminA, false, tokenA), status(adminB, false, tokenB)])
    assert.deepEqual(results.map((response) => response.status).sort(), [200, 409])
    assert.equal(await database.client.user.count({ where: { role: 'Admin', isActive: true, passwordChangeRequired: false } }), 1)
  })
})
test('cross-admin disable races serialize before actor authentication so a disabled actor cannot commit the opposing change', async () => {
  await withAdmins([adminA, adminB], async () => {
    const results = await Promise.all([status(adminB, false, tokenA), status(adminA, false, tokenB)])
    assert.deepEqual(results.map((response) => response.status).sort(), [200, 401])
    assert.equal(await database.client.user.count({ where: { role: 'Admin', isActive: true, passwordChangeRequired: false } }), 1)
  })
})
test('audit or replay failure rolls back account status and every session revocation together', async () => {
  for (const table of ['audit_logs', 'command_replays']) {
    const user = await fixture('Admin'); const signedIn = await session(user.id); const key = randomUUID(); const before = await counts()
    await sql.query(`CREATE FUNCTION fixture_fail_account() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic account failure'; END; $$; CREATE TRIGGER fixture_account_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fixture_fail_account();`)
    try { const failed = await status(user.id, false, tokenA, key).expect(500); assert.ok(!failed.text.includes('Synthetic account failure')) }
    finally { await sql.query(`DROP TRIGGER fixture_account_failure ON ${table}; DROP FUNCTION fixture_fail_account()`) }
    assert.deepEqual(await counts(), before)
    assert.equal((await database.client.user.findUniqueOrThrow({ where: { id: user.id } })).isActive, true)
    assert.equal((await database.client.authSession.findUniqueOrThrow({ where: { id: signedIn.sessionId } })).revokedAt, null)
    await status(user.id, false, tokenA, key).expect(200)
  }
})
test('admin creation also rolls back its hash/user/audit/replay if audit persistence fails', async () => {
  const body = input(); const key = randomUUID(); const before = await counts()
  await sql.query("CREATE FUNCTION fixture_fail_admin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic admin failure'; END; $$; CREATE TRIGGER fixture_admin_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fixture_fail_admin();")
  try { await create(body, key).expect(500) } finally { await sql.query('DROP TRIGGER fixture_admin_failure ON audit_logs; DROP FUNCTION fixture_fail_admin()') }
  assert.deepEqual(await counts(), before); await create(body, key).expect(201)
})
test('a contended status mutex returns bounded safe retry guidance without changing account/audit/replay', async () => {
  const holder = new Client({ connectionString: databaseUrl.toString() }); await holder.connect()
  const before = await counts(); const key = randomUUID()
  await holder.query('BEGIN'); await holder.query('SELECT pg_advisory_xact_lock(1213350482, 1)')
  try { const response = await status(adminB, false, tokenA, key).expect(503); assert.equal(response.body.error.code, 'ACCOUNT_CHANGE_RETRY_REQUIRED'); assert.equal(response.headers['retry-after'], '1'); assert.deepEqual(await counts(), before) }
  finally { await holder.query('ROLLBACK'); await holder.end() }
  await withAdmins([adminA, adminB], async () => { await status(adminB, false, tokenA, key).expect(200) })
})

test('disable racing verified login cannot leave a usable newly issued session', async () => {
  const user = await fixture('Admin')
  const [login, disabled] = await Promise.all([
    request(app).post('/api/v1/auth-sessions/login').send({ email: user.email, password }),
    status(user.id, false),
  ])
  assert.equal(disabled.status, 200); assert.ok([200, 401].includes(login.status))
  assert.equal((await database.client.user.findUniqueOrThrow({ where: { id: user.id } })).isActive, false)
  assert.equal(await database.client.authSession.count({ where: { userId: user.id, revokedAt: null } }), 0)
  if (login.status === 200) await get('users/me', login.body.accessToken).expect(401)
})
test('disable racing password change preserves a disabled account and invalidates every old session without deadlock', async () => {
  const user = await fixture('Admin'); const signedIn = await session(user.id)
  const [changed, disabled] = await Promise.all([
    request(app).post('/api/v1/users/me/password').set('Authorization', `Bearer ${signedIn.token}`).send({ currentPassword: password, newPassword: nextPassword }),
    status(user.id, false),
  ])
  assert.equal(disabled.status, 200); assert.ok([204, 401].includes(changed.status))
  assert.equal((await database.client.user.findUniqueOrThrow({ where: { id: user.id } })).isActive, false)
  assert.equal(await database.client.authSession.count({ where: { userId: user.id, revokedAt: null } }), 0)
  await get('users/me', signedIn.token).expect(401)
  assert.equal(await database.client.auditLog.count({ where: { entityId: user.id, action: 'account.password_changed' } }), changed.status === 204 ? 1 : 0)
})
