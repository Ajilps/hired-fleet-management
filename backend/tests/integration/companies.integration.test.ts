import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { before, after, test } from 'node:test'
import { Client } from 'pg'
import request from 'supertest'
import { createApp } from '../../src/app.ts'
import { createDatabase } from '../../src/database/database-client.ts'
import { readEnvironment } from '../../src/config/environment.ts'
import { readAuthConfig } from '../../src/modules/auth/index.ts'
import { signAccessToken } from '../../src/modules/auth/token-service.ts'
import { createCompanyRouter } from '../../src/modules/companies/index.ts'

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must identify a disposable PostgreSQL service with CREATE DATABASE permission.')
const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL })
const databaseName = `hired_companies_${randomBytes(6).toString('hex')}`
const databaseUrl = new URL(process.env.TEST_DATABASE_URL); databaseUrl.pathname = `/${databaseName}`
const database = createDatabase(readEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl.toString() }))
const auth = readAuthConfig({ AUTH_SESSION_KEY: randomBytes(32).toString('base64url') })
const app = createApp({ corsOrigins: [] }, database, () => false, createCompanyRouter(database.client, auth, randomBytes(32)))
const actorId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
let token: string
let sql: Client
const root = fileURLToPath(new URL('../../', import.meta.url))
const environment = { ...process.env, DATABASE_URL: databaseUrl.toString(), MIGRATION_DATABASE_URL: databaseUrl.toString() }
before(async () => {
  await admin.connect(); await admin.query(`CREATE DATABASE "${databaseName}"`)
  sql = new Client({ connectionString: databaseUrl.toString() }); await sql.connect()
  for (const migration of ['20261017120952_create_identity_tables', '20261017125940_add_auth_session_security', '20261017134500_add_durable_commands']) {
    await sql.query(await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8'))
    await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'resolve', '--applied', migration], { cwd: root, env: environment })
  }
  await sql.query(`INSERT INTO users (id,email,password_hash,role,full_name,created_at,updated_at)
    VALUES ('${actorId}','synthetic-company-admin@example.test','synthetic-unused-hash','admin','Synthetic Admin',now(),now());
    INSERT INTO auth_sessions (id,user_id,refresh_token_hash,transport,expires_at,created_at)
    VALUES ('${sessionId}','${actorId}','synthetic-preserved-refresh','browser',now()+interval '1 day',now());
    INSERT INTO auth_refresh_tokens VALUES (repeat('a',64),'${sessionId}',now());
    INSERT INTO auth_rate_limits VALUES (repeat('b',64),3,now()+interval '1 hour');
    INSERT INTO audit_logs (actor_user_id,entity_type,entity_id,action,created_at) VALUES ('${actorId}','fixture','${actorId}','fixture.prior',now());
    INSERT INTO command_replays (id,actor_user_id,request_method,canonical_path,idempotency_key,request_fingerprint,outcome,response_status,response_body,response_headers,created_at,expires_at)
    VALUES ('33333333-3333-4333-8333-333333333333','${actorId}','POST','/api/v1/fixture','prior-key',repeat('c',64),'succeeded',200,'{"preserved":true}','{}',now(),now()+interval '25 hours');`)
  for (let deployment = 0; deployment < 2; deployment++) await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { cwd: root, env: environment })
  token = await signAccessToken(actorId, sessionId, new Date(Date.now() + 3_600_000), auth)
})
after(async () => {
  await database.close(); await sql?.end().catch(() => undefined)
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`); await admin.end()
})
function profile(name = randomUUID()) { return { legalName: `Synthetic ${name}`, displayName: `Synthetic ${name}`, contactName: 'Synthetic Contact', contactEmail: 'Contact@example.test', contactPhone: '123456789', billingAddress: 'Synthetic test address', initialPayoutRate: { driverPercent: '30.00', companyPercent: '70.00' } } }
function create(input = profile(), key = randomUUID(), bearer = token) { return request(app).post('/api/v1/companies').set('Authorization', `Bearer ${bearer}`).set('Idempotency-Key', key).send(input) }
function rate(id: string, key = randomUUID(), body = { driverPercent: '65.25', companyPercent: '34.75', reason: 'Synthetic change' }) { return request(app).post(`/api/v1/companies/${id}/payout-rates`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body) }
function get(path: string, bearer = token) { return request(app).get(`/api/v1/${path}`).set('Authorization', `Bearer ${bearer}`) }
async function snapshot() { return { companies: await database.client.company.count(), rates: await database.client.companyPayoutRate.count(), audit: await database.client.auditLog.count(), replay: await database.client.commandReplay.count() } }

test('company migration preserves populated auth, append-only audit and command replay history', async () => {
  assert.equal((await database.client.user.findUniqueOrThrow({ where: { id: actorId } })).passwordHash, 'synthetic-unused-hash')
  assert.equal((await database.client.authSession.findUniqueOrThrow({ where: { id: sessionId } })).transport, 'browser')
  assert.equal(await database.client.authRefreshToken.count({ where: { sessionId } }), 1)
  assert.equal((await database.client.authRateLimit.findUniqueOrThrow({ where: { keyHash: 'b'.repeat(64) } })).attempts, 3)
  assert.equal(await database.client.auditLog.count({ where: { action: 'fixture.prior' } }), 1)
  assert.deepEqual((await database.client.commandReplay.findUniqueOrThrow({ where: { id: '33333333-3333-4333-8333-333333333333' } })).responseBody, { preserved: true })
  await request(app).get('/ready').expect(200)
})
test('company creation commits initial exact rate, two audit events and one replay with fresh request IDs', async () => {
  const before = await snapshot(); const input = profile(); const key = randomUUID()
  const first = await create(input, key).expect(201); const second = await create(input, key).expect(201)
  assert.deepEqual(second.body, first.body); assert.equal(first.body.contactEmail, input.contactEmail)
  assert.equal(first.headers.location, `/api/v1/companies/${first.body.id}`)
  assert.notEqual(first.headers['x-request-id'], second.headers['x-request-id'])
  assert.equal(first.body.requestId, undefined)
  const rates = await get(`companies/${first.body.id}/payout-rates`).expect(200)
  assert.equal(rates.body.items[0].driverPercent, '30.00'); assert.equal(rates.body.items[0].companyPercent, '70.00')
  assert.equal(rates.body.items[0].effectiveTo, null)
  const after = await snapshot()
  assert.deepEqual(after, { companies: before.companies + 1, rates: before.rates + 1, audit: before.audit + 2, replay: before.replay + 1 })
  await get(`companies/${first.body.id}`).expect(200, first.body)
})
test('concurrent same-key creation produces one company and changed input conflicts', async () => {
  const input = profile(); const key = randomUUID(); const before = await snapshot()
  const responses = await Promise.all([create(input, key), create(input, key)])
  assert.ok(responses.every((response) => response.status === 201 || (response.status === 409 && response.body.error.code === 'COMMAND_IN_PROGRESS')))
  const saved = await create(input, key).expect(201)
  assert.ok(responses.some((response) => response.status === 201 && response.body.id === saved.body.id))
  await create({ ...input, contactName: 'Different intent' }, key).expect(409).expect((response) => assert.equal(response.body.error.code, 'IDEMPOTENCY_KEY_REUSED'))
  assert.equal((await snapshot()).companies, before.companies + 1)
})
test('strict creation rejects invalid split, missing identity and client-owned status/scope/time fields', async () => {
  const before = await snapshot(); const input = profile()
  await request(app).post('/api/v1/companies').set('Authorization', `Bearer ${token}`).send(input).expect(422)
  for (const body of [{ ...input, isActive: false }, { ...input, companyId: randomUUID() }, { ...input, initialPayoutRate: { driverPercent: 'NaN', companyPercent: '70.00' } }, { ...input, initialPayoutRate: { driverPercent: '30.001', companyPercent: '70.00' } }, { ...input, initialPayoutRate: { driverPercent: '30.00', companyPercent: '69.99' } }]) await create(body).expect(422)
  assert.deepEqual(await snapshot(), before)
})
test('unauthenticated, disabled, revoked and non-admin credentials cannot read or mutate companies', async () => {
  const company = (await create().expect(201)).body
  await request(app).get('/api/v1/companies').expect(401)
  await create(profile(), randomUUID(), 'invalid').expect(401)
  for (const role of ['Partner', 'Driver'] as const) {
    const id = randomUUID(); const sid = randomUUID()
    await database.client.user.create({ data: { id, email: `synthetic-${id}@example.test`, passwordHash: 'unused', fullName: 'Synthetic Role', role, createdAt: new Date(), updatedAt: new Date() } })
    await database.client.authSession.create({ data: { id: sid, userId: id, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000), createdAt: new Date() } })
    const otherToken = await signAccessToken(id, sid, new Date(Date.now() + 60_000), auth)
    await get('companies', otherToken).expect(403); await get(`companies/${company.id}`, otherToken).expect(403); await create(profile(), randomUUID(), otherToken).expect(403)
  }
  await database.client.user.update({ where: { id: actorId }, data: { isActive: false } })
  try { await get('companies').expect(401) } finally { await database.client.user.update({ where: { id: actorId }, data: { isActive: true } }) }
  const otherId = randomUUID(); await database.client.authSession.create({ data: { id: otherId, userId: actorId, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date(), createdAt: new Date() } })
  await get('companies', await signAccessToken(actorId, otherId, new Date(Date.now() + 60_000), auth)).expect(401)
  await get(`companies/${randomUUID()}`).expect(404)
})
test('company and rate rows, audit and replay roll back when initial-rate insertion fails', async () => {
  const before = await snapshot(); const input = profile(); const key = randomUUID()
  await sql.query("CREATE FUNCTION fixture_fail_rate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic rate failure' USING ERRCODE='23514'; END; $$; CREATE TRIGGER fixture_rate_failure BEFORE INSERT ON company_payout_rates FOR EACH ROW EXECUTE FUNCTION fixture_fail_rate();")
  try { const failure = await create(input, key).expect(500); assert.ok(!failure.text.includes('Synthetic rate failure')) }
  finally { await sql.query('DROP TRIGGER fixture_rate_failure ON company_payout_rates; DROP FUNCTION fixture_fail_rate()') }
  assert.deepEqual(await snapshot(), before)
  await create(input, key).expect(201)
})
test('profile deactivation is audited and replayed while profile and rate history remain readable', async () => {
  const company = (await create().expect(201)).body; const key = randomUUID()
  const patch = () => request(app).patch(`/api/v1/companies/${company.id}`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send({ isActive: false, displayName: 'Updated synthetic company' })
  const changed = await patch().expect(200); assert.equal(changed.body.isActive, false)
  assert.deepEqual((await patch().expect(200)).body, changed.body)
  await get(`companies/${company.id}`).expect(200, changed.body)
  await get(`companies/${company.id}/payout-rates`).expect(200)
  assert.equal(await database.client.auditLog.count({ where: { entityId: company.id, action: 'company.updated' } }), 1)
  await request(app).patch(`/api/v1/companies/${company.id}`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID()).send({}).expect(422)
})
test('new payout split closes the old interval once and serializes exact decimals', async () => {
  const company = (await create().expect(201)).body; const key = randomUUID()
  const changed = await rate(company.id, key).expect(201)
  assert.equal(changed.body.driverPercent, '65.25'); assert.equal(changed.body.companyPercent, '34.75')
  assert.deepEqual((await rate(company.id, key).expect(201)).body, changed.body)
  const history = await get(`companies/${company.id}/payout-rates`).expect(200)
  assert.equal(history.body.pageInfo.totalCount, 2)
  assert.equal(history.body.items[1].effectiveTo, changed.body.effectiveFrom)
  assert.equal(history.body.items[0].effectiveTo, null)
  assert.equal(await database.client.auditLog.count({ where: { entityId: changed.body.id, action: 'company.rate_created' } }), 1)
  await rate(company.id, randomUUID(), { driverPercent: '30.00', companyPercent: '70.00', reason: '' }).expect(422)
  await request(app).post(`/api/v1/companies/${company.id}/payout-rates`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID()).send({ driverPercent: '30.00', companyPercent: '70.00', reason: 'Synthetic', effectiveFrom: new Date().toISOString() }).expect(422)
})
test('concurrent distinct rate intents preserve adjacent non-overlapping history', async () => {
  const company = (await create().expect(201)).body
  const intents = [randomUUID(), randomUUID()]
  const results = await Promise.all(intents.map((key) => rate(company.id, key)))
  for (let index = 0; index < results.length; index++) {
    const response = results[index]!
    if (response.status === 409 && response.body.error.code === 'RATE_CHANGE_CONFLICT') await rate(company.id, intents[index]!).expect(201)
    else assert.equal(response.status, 201)
  }
  const history = await database.client.companyPayoutRate.findMany({ where: { companyId: company.id }, orderBy: { effectiveFrom: 'asc' } })
  assert.equal(history.length, 3)
  assert.equal(history[0]!.effectiveTo!.toISOString(), history[1]!.effectiveFrom.toISOString())
  assert.equal(history[1]!.effectiveTo!.toISOString(), history[2]!.effectiveFrom.toISOString())
  assert.equal(history[2]!.effectiveTo, null)
})
test('rate insertion failure rolls back closure of the previous rate and its audit/replay effects', async () => {
  const company = (await create().expect(201)).body; const before = await snapshot(); const key = randomUUID()
  await sql.query("CREATE FUNCTION fixture_fail_rate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic rate failure' USING ERRCODE='23514'; END; $$; CREATE TRIGGER fixture_rate_failure BEFORE INSERT ON company_payout_rates FOR EACH ROW EXECUTE FUNCTION fixture_fail_rate();")
  try { await rate(company.id, key).expect(500) } finally { await sql.query('DROP TRIGGER fixture_rate_failure ON company_payout_rates; DROP FUNCTION fixture_fail_rate()') }
  assert.deepEqual(await snapshot(), before)
  assert.equal((await database.client.companyPayoutRate.findFirstOrThrow({ where: { companyId: company.id } })).effectiveTo, null)
  await rate(company.id, key).expect(201)
})
test('database rejects overlapping, invalid and rewritten payout history', async () => {
  const company = (await create().expect(201)).body
  const original = await database.client.companyPayoutRate.findFirstOrThrow({ where: { companyId: company.id } })
  const insert = (driver: string, business: string, from: Date, to: Date | null) => sql.query('INSERT INTO company_payout_rates (id,company_id,driver_percent,company_percent,effective_from,effective_to,created_by_user_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())', [randomUUID(), company.id, driver, business, from, to, actorId])
  await assert.rejects(insert('0.00', '100.00', original.effectiveFrom, null), { code: '23514' })
  await assert.rejects(insert('30.00', '69.99', original.effectiveFrom, null), { code: '23514' })
  await assert.rejects(insert('30.00', '70.00', new Date(original.effectiveFrom.getTime() + 1000), new Date(original.effectiveFrom.getTime() + 2000)), { code: '23P01' })
  await assert.rejects(insert('30.00', '70.00', original.effectiveFrom, original.effectiveFrom), { code: '23514' })
  await assert.rejects(sql.query('UPDATE company_payout_rates SET driver_percent=40,company_percent=60 WHERE id=$1', [original.id]), { code: '23514' })
  await assert.rejects(sql.query('DELETE FROM company_payout_rates WHERE id=$1', [original.id]), { code: '23514' })
  await assert.rejects(sql.query('TRUNCATE company_payout_rates'), { code: '23514' })
  await rate(company.id).expect(201)
  await assert.rejects(sql.query('UPDATE company_payout_rates SET effective_to=effective_to+interval \'1 second\' WHERE id=$1', [original.id]), { code: '23514' })
})
test('membership guards require a partner and enforce one company per partner account', async () => {
  const first = (await create().expect(201)).body; const second = (await create().expect(201)).body
  await assert.rejects(sql.query('INSERT INTO company_users VALUES ($1,$2,false,now())', [first.id, actorId]), { code: '23514' })
  const id = randomUUID()
  await database.client.user.create({ data: { id, email: `synthetic-${id}@example.test`, passwordHash: 'unused', role: 'Partner', fullName: 'Synthetic Partner', createdAt: new Date(), updatedAt: new Date() } })
  await sql.query('INSERT INTO company_users VALUES ($1,$2,false,now())', [first.id, id])
  await assert.rejects(sql.query('INSERT INTO company_users VALUES ($1,$2,false,now())', [second.id, id]), { code: '23505' })
  await assert.rejects(sql.query("UPDATE users SET role='admin' WHERE id=$1", [id]), { code: '23514' })
})
test('signed company cursors bind actor and collection, preserving tied timestamps and full totals', async () => {
  const now = new Date('2030-01-01T00:00:00.000Z'); const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()].sort().reverse()
  for (const id of ids) await database.client.company.create({ data: { id, legalName: 'Synthetic Tie', displayName: 'Synthetic Tie', contactName: 'Synthetic', contactEmail: 'tie@example.test', contactPhone: '123', billingAddress: 'Synthetic', createdAt: now, updatedAt: now } })
  const total = await database.client.company.count()
  const first = await get('companies?limit=2').expect(200)
  assert.deepEqual(first.body.items.map((item: { id: string }) => item.id), ids.slice(0, 2)); assert.equal(first.body.pageInfo.totalCount, total)
  const cursor = first.body.pageInfo.nextCursor
  const second = await get(`companies?limit=2&cursor=${encodeURIComponent(cursor)}`).expect(200)
  assert.deepEqual(second.body.items.map((item: { id: string }) => item.id), ids.slice(2)); assert.equal(second.body.pageInfo.totalCount, total)
  const otherSession = randomUUID(); const otherActor = randomUUID()
  await database.client.user.create({ data: { id: otherActor, email: `synthetic-${otherActor}@example.test`, passwordHash: 'unused', role: 'Admin', fullName: 'Other Admin', createdAt: new Date(), updatedAt: new Date() } })
  await database.client.authSession.create({ data: { id: otherSession, userId: otherActor, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000), createdAt: now } })
  const other = await signAccessToken(otherActor, otherSession, new Date(Date.now() + 60_000), auth)
  await get(`companies?cursor=${encodeURIComponent(cursor)}`, other).expect(422)
  await get(`companies/${ids[0]}/payout-rates?cursor=${encodeURIComponent(cursor)}`).expect(422)
  await get(`companies?cursor=${encodeURIComponent(cursor.replace(/^./, cursor[0] === 'A' ? 'B' : 'A'))}`).expect(422)
  await get('companies?search=undocumented').expect(422)
})
test('rate cursors are company-scoped and history totals cover all pages', async () => {
  const first = (await create().expect(201)).body; const second = (await create().expect(201)).body
  await rate(first.id).expect(201)
  const page = await get(`companies/${first.id}/payout-rates?limit=1`).expect(200)
  assert.equal(page.body.pageInfo.totalCount, 2)
  const cursor = encodeURIComponent(page.body.pageInfo.nextCursor)
  const next = await get(`companies/${first.id}/payout-rates?limit=1&cursor=${cursor}`).expect(200)
  assert.equal(next.body.pageInfo.totalCount, 2); assert.equal(next.body.pageInfo.hasMore, false)
  assert.notEqual(next.body.items[0].id, page.body.items[0].id)
  await get(`companies/${second.id}/payout-rates?cursor=${cursor}`).expect(422)
})

test('a non-advancing rate clock refuses the command without empty intervals or partial effects', async () => {
  const id = randomUUID()
  await sql.query(`INSERT INTO companies SELECT $1,legal_name,display_name,contact_name,contact_email,contact_phone,billing_address,is_active,created_at,updated_at FROM companies LIMIT 1`, [id])
  await sql.query(`INSERT INTO company_payout_rates (id,company_id,driver_percent,company_percent,effective_from,created_by_user_id,created_at) VALUES ($1,$2,30,70,now()+interval '1 day',$3,now())`, [randomUUID(), id, actorId])
  const before = await snapshot(); const response = await rate(id).expect(409)
  assert.equal(response.body.error.code, 'RATE_CHANGE_CONFLICT')
  assert.equal(response.headers['retry-after'], '1')
  assert.deepEqual(await snapshot(), before)
})
