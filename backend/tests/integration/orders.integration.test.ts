import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { before, after, test } from 'node:test'
import { Router } from 'express'
import { mkdtemp, readdir as readDirectory, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNotificationRouter } from '../../src/modules/notifications/notification-routes.ts'
import { createNotificationWorker } from '../../src/modules/notifications/notification-worker.ts'
import { createCaptureTransport } from '../../src/modules/notifications/capture-transport.ts'
import { Client } from 'pg'
import request from 'supertest'
import { createApp } from '../../src/app.ts'
import { createDatabase } from '../../src/database/database-client.ts'
import { readEnvironment } from '../../src/config/environment.ts'
import { readAuthConfig } from '../../src/modules/auth/index.ts'
import { signAccessToken } from '../../src/modules/auth/token-service.ts'
import { createOrderRouter, readOrderCodeCipher } from '../../src/modules/orders/index.ts'
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must identify a disposable PostgreSQL service.')
const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL })
const name = `hired_orders_${randomBytes(6).toString('hex')}`
const url = new URL(process.env.TEST_DATABASE_URL); url.pathname = `/${name}`
const db = createDatabase(readEnvironment({ NODE_ENV: 'test', DATABASE_URL: url.toString() }))
const auth = readAuthConfig({ AUTH_SESSION_KEY: randomBytes(32).toString('base64url') })
const fingerprint = randomBytes(32)
const cipher = readOrderCodeCipher({ TRIP_CODE_ENCRYPTION_KEY: randomBytes(32).toString('base64url') })!
const routes = Router(); routes.use(createOrderRouter(db.client, auth, fingerprint, cipher)); routes.use(createNotificationRouter(db.client, auth, fingerprint))
const app = createApp({ corsOrigins: [] }, db, () => false, routes)
let sql: Client; let token: string; let partner: string; let other: string; let companyId: string; let actorId: string
async function user(role: 'Admin' | 'Partner', company?: string) {
 const id = randomUUID(); const sessionId = randomUUID(); const now = new Date()
 await db.client.user.create({ data: { id, email: `synthetic-${id}@example.test`, passwordHash: 'unused', role, fullName: 'Synthetic Actor', createdAt: now, updatedAt: now } })
 if (company) await db.client.companyUser.create({ data: { companyId: company, userId: id, createdAt: now } })
 await db.client.authSession.create({ data: { id: sessionId, userId: id, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3_600_000), createdAt: now } })
 return { id, token: await signAccessToken(id, sessionId, new Date(Date.now() + 3_600_000), auth) }
}
async function company() { const now = new Date(); return (await db.client.company.create({ data: { id: randomUUID(), legalName: 'Synthetic Company', displayName: 'Synthetic', contactName: 'Synthetic Contact', contactEmail: 'synthetic@example.test', contactPhone: '123', billingAddress: 'Synthetic address', createdAt: now, updatedAt: now } })).id }
before(async () => {
 await admin.connect(); await admin.query(`CREATE DATABASE "${name}"`)
 sql = new Client({ connectionString: url.toString() }); await sql.connect()
 const base = new URL('../../prisma/migrations/', import.meta.url)
 const migrations = (await readdir(base)).filter(value => value !== 'migration_lock.toml').sort()
 for (const migration of migrations.filter(value => value < '20261022090000')) await sql.query(await readFile(new URL(`${migration}/migration.sql`, base), 'utf8'))
 const actor = await user('Admin'); actorId = actor.id; token = actor.token; companyId = await company()
 // Upgrade populated prior schema, preserving current user/session/company state.
 for (const migration of migrations.filter(value => value >= '20261022090000')) await sql.query(await readFile(new URL(`${migration}/migration.sql`, base), 'utf8'))
 partner = (await user('Partner', companyId)).token; other = (await user('Partner', await company())).token
})
after(async () => { await db.close(); await sql?.end().catch(() => undefined); await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await admin.end() })
function input() { return { pickup: { address: 'Synthetic Pickup', latitude: 12.123456, longitude: 77.123456 }, drop: { address: 'Synthetic Drop' }, contact: { name: 'Synthetic Contact', phone: '123' }, requestedPickupAt: '2026-11-01T05:00:00.000Z', routeDistanceKm: '12.50' } }
function get(path: string, bearer = token) { return request(app).get(`/api/v1/${path}`).set('Authorization', `Bearer ${bearer}`) }
function create(body: object = input(), bearer = partner, key = randomUUID()) { return request(app).post('/api/v1/orders').set('Authorization', `Bearer ${bearer}`).set('Idempotency-Key', key).send(body) }
function decide(id: string, action: string, etag?: string, key = randomUUID(), body: object = action === 'accept' ? { totalAmount: '1234567890.01' } : { reason: 'Synthetic rejection' }, bearer = token) { const req = request(app).post(`/api/v1/orders/${id}/${action}`).set('Authorization', `Bearer ${bearer}`).set('Idempotency-Key', key); if (etag) req.set('If-Match', etag); return req.send(body) }
async function received() { const order = await create().expect(201); const detail = await get(`orders/${order.body.id}`).expect(200); return { id: order.body.id as string, etag: detail.headers.etag as string } }
async function counts() { return [await db.client.order.count(), await db.client.trip.count(), await db.client.notification.count(), await db.client.commandReplay.count(), await db.client.auditLog.count()] }

test('populated upgrade preserves identity/company/session and readiness', async () => { assert.equal((await db.client.user.findUniqueOrThrow({ where: { id: actorId } })).role, 'Admin'); await get(`orders?companyId=${companyId}`).expect(200); await request(app).get('/ready').expect(200) })
test('partner intake derives company/source; exact retry returns original and changed intent conflicts', async () => {
 const body = input(); const key = randomUUID(); const before = await counts(); const saved = await create(body, partner, key).expect(201)
 assert.equal(saved.body.companyId, companyId); assert.equal(saved.body.source, 'partner_portal'); assert.equal(saved.body.status, 'received'); assert.equal(saved.body.estimate.durationMinutes, null)
 assert.deepEqual((await create(body, partner, key).expect(201)).body, saved.body)
 await create({ ...body, serviceNotes: 'changed' }, partner, key).expect(409)
 const after = await counts(); assert.equal(after[0], before[0]! + 1); assert.equal(after[3], before[3]! + 1); assert.equal(after[4], before[4]! + 1)
})
test('strict role/scope validation prevents forged company/source and foreign detail/count leakage', async () => {
 const { id } = await received()
 await create({ ...input(), companyId }).expect(422); await create({ ...input(), source: 'admin_manual' }).expect(422)
 await create(input(), token).expect(422)
 await create({ ...input(), companyId, source: 'admin_manual' }, token).expect(201)
 await get(`orders/${id}`, other).expect(404)
 await get(`orders?companyId=${companyId}`, other).expect(422)
 assert.equal((await get('orders', other).expect(200)).body.pageInfo.totalCount, 0)
 await request(app).get('/api/v1/orders').expect(401)
 await decide(id, 'accept', '"wrong"', randomUUID(), { totalAmount: '1.00' }, partner).expect(403)
})
test('strong preconditions required and weak/stale tags do not write', async () => {
 const { id, etag } = await received(); const before = await counts()
 await decide(id, 'accept').expect(428); await decide(id, 'accept', `W/${etag}`).expect(412); await decide(id, 'reject', '"stale"').expect(412)
 assert.deepEqual(await counts(), before)
})
test('accept creates one unassigned exact-value trip and one outbox intent; lost response replay ignores old version', async () => {
 const { id, etag } = await received(); const key = randomUUID(); const saved = await decide(id, 'accept', etag, key).expect(200)
 assert.equal(saved.body.trip.totalAmount, '1234567890.01'); assert.equal(saved.body.trip.status, 'unassigned'); assert.equal(saved.body.order.tripId, saved.body.trip.id); assert.notEqual(saved.headers.etag, etag)
 assert.deepEqual((await decide(id, 'accept', etag, key).expect(200)).body, saved.body)
 assert.equal(await db.client.trip.count({ where: { orderId: id } }), 1); assert.equal(await db.client.notification.count({ where: { orderId: id } }), 1)
 const trip = await db.client.trip.findUniqueOrThrow({ where: { orderId: id } }); assert.match(cipher.decrypt(trip.id, trip.otpKeyId, trip.otpEncryptedValue), /^[0-9]{6}$/)
 const persisted = JSON.stringify([saved.body, (await db.client.commandReplay.findMany()).map(value => value.responseBody), (await db.client.auditLog.findMany()).map(value => value.afterData), (await db.client.notification.findMany()).map(value => value.payload)])
 assert.ok(!persisted.includes(trip.otpEncryptedValue)); assert.ok(!persisted.includes(trip.otpHash)); assert.ok(!persisted.includes('otpEncryptedValue'))
 await decide(id, 'reject', etag).expect(409)
})
test('accept versus reject and different-key duplicate accepts have one terminal winner', async () => {
 for (const actions of [['accept', 'reject'], ['accept', 'accept']]) {
  const { id, etag } = await received(); const responses = await Promise.all(actions.map(action => decide(id, action, etag)))
  assert.deepEqual(responses.map(value => value.status).sort(), [200, 409])
  const order = await db.client.order.findUniqueOrThrow({ where: { id } })
  assert.equal(await db.client.trip.count({ where: { orderId: id } }), order.status === 'accepted' ? 1 : 0)
  assert.equal(await db.client.notification.count({ where: { orderId: id } }), 1)
 }
})
test('same-key concurrent accept can be recovered without a second trip or email', async () => {
 const { id, etag } = await received(); const key = randomUUID(); const results = await Promise.all([decide(id, 'accept', etag, key), decide(id, 'accept', etag, key)])
 assert.ok(results.every(value => value.status === 200 || (value.status === 409 && value.body.error.code === 'COMMAND_IN_PROGRESS')))
 await decide(id, 'accept', etag, key).expect(200)
 assert.equal(await db.client.trip.count({ where: { orderId: id } }), 1); assert.equal(await db.client.notification.count({ where: { orderId: id } }), 1)
})
test('outbox insert failure rolls back decision, trip, audit and replay; same request recovers', async () => {
 const { id, etag } = await received(); const key = randomUUID(); const before = await counts()
 await sql.query("CREATE FUNCTION fixture_fail_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER fixture_fail_notification BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fixture_fail_notification();")
 try { await decide(id, 'accept', etag, key).expect(500); assert.deepEqual(await counts(), before) }
 finally { await sql.query('DROP TRIGGER fixture_fail_notification ON notifications; DROP FUNCTION fixture_fail_notification()') }
 await decide(id, 'accept', etag, key).expect(200)
})
test('rejection captures reason/recipient; missing recipient fails visibly without losing business result', async () => {
 const first = await received(); await decide(first.id, 'reject', first.etag).expect(200)
 const item = await db.client.notification.findFirstOrThrow({ where: { orderId: first.id } }); assert.equal(item.recipientEmail, 'synthetic@example.test'); assert.equal(item.status, 'pending')
 await db.client.company.update({ where: { id: companyId }, data: { contactEmail: 'invalid-synthetic-email' } })
 try { const next = await received(); await decide(next.id, 'reject', next.etag).expect(200); const failed = await db.client.notification.findFirstOrThrow({ where: { orderId: next.id } }); assert.equal(failed.status, 'failed'); assert.equal(failed.failureReason, 'RECIPIENT_MISSING'); assert.equal(failed.recipientEmail, null) }
 finally { await db.client.company.update({ where: { id: companyId }, data: { contactEmail: 'synthetic@example.test' } }) }
})
test('company inactive blocks intake and acceptance; rejection remains available', async () => {
 const { id, etag } = await received(); await db.client.company.update({ where: { id: companyId }, data: { isActive: false } })
 try { await create().expect(409); await decide(id, 'accept', etag).expect(409); await decide(id, 'reject', etag).expect(200) }
 finally { await db.client.company.update({ where: { id: companyId }, data: { isActive: true } }) }
})
test('cursor covers full scope and totals; filters use exclusive upper dates', async () => {
 const one = await get('orders?limit=1', partner).expect(200); assert.equal(one.body.items.length, 1); assert.equal(one.body.pageInfo.hasMore, true)
 const next = await get(`orders?limit=1&cursor=${encodeURIComponent(one.body.pageInfo.nextCursor)}`, partner).expect(200)
 assert.notEqual(next.body.items[0].id, one.body.items[0].id); assert.equal(next.body.pageInfo.totalCount, one.body.pageInfo.totalCount)
 await get(`orders?status=received&cursor=${encodeURIComponent(one.body.pageInfo.nextCursor)}`, partner).expect(422)
 await get(`orders?cursor=${encodeURIComponent(one.body.pageInfo.nextCursor)}`, other).expect(422)
 assert.equal((await get('orders?createdTo=2000-01-01T00:00:00Z', partner).expect(200)).body.pageInfo.totalCount, 0)
})
test('current account and membership are rechecked before a stored replay', async () => {
 const key = randomUUID(); const saved = await create(input(), partner, key).expect(201)
 const row = await db.client.order.findUniqueOrThrow({ where: { id: saved.body.id } })
 await db.client.user.update({ where: { id: row.createdByUserId }, data: { isActive: false } })
 try { await create(input(), partner, key).expect(401) } finally { await db.client.user.update({ where: { id: row.createdByUserId }, data: { isActive: true } }) }
 const movedCompany = await company()
 await db.client.companyUser.update({ where: { userId: row.createdByUserId }, data: { companyId: movedCompany } })
 try { await create(input(), partner, key).expect(404) } finally { await db.client.companyUser.update({ where: { userId: row.createdByUserId }, data: { companyId } }) }
 await db.client.companyUser.delete({ where: { userId: row.createdByUserId } })
 try { await create(input(), partner, key).expect(403) } finally { await db.client.companyUser.create({ data: { companyId, userId: row.createdByUserId, createdAt: new Date() } }) }
})
test('database rejects accepted order without trip and cross-company trip changes', async () => {
 const { id } = await received()
 await assert.rejects(sql.query('UPDATE orders SET status=\'accepted\',accepted_at=now(),accepted_by_user_id=$2 WHERE id=$1', [id, actorId]))
 assert.equal((await db.client.order.findUniqueOrThrow({ where: { id } })).status, 'received')
 const accepted = await received(); await decide(accepted.id, 'accept', accepted.etag, randomUUID(), { totalAmount: '0.00' }).expect(200)
 await assert.rejects(sql.query('UPDATE trips SET company_id=$2 WHERE order_id=$1', [accepted.id, await company()]))
})


test('trip handoff reads expose scope-safe detail, counts, scheduled filters and empty assignment history', async () => {
 const order = await received(); const accepted = await decide(order.id, 'accept', order.etag).expect(200); const id = accepted.body.trip.id
 const detail = await get(`trips/${id}`, partner).expect(200); assert.equal(detail.body.id, id); assert.match(detail.headers.etag!, /^"trip:/)
 await get(`trips/${id}`, other).expect(404)
 assert.equal((await get('trips', other).expect(200)).body.pageInfo.totalCount, 0)
 await get(`trips?companyId=${companyId}`, partner).expect(422)
 assert.equal((await get('trips?scheduledTo=2026-11-01T05:00:00.000Z', partner).expect(200)).body.pageInfo.totalCount, 0)
 const one = (await get('trips?limit=1', partner).expect(200)).body
 const two = (await get(`trips?limit=1&cursor=${encodeURIComponent(one.pageInfo.nextCursor)}`, partner).expect(200)).body
 assert.equal(one.pageInfo.totalCount, two.pageInfo.totalCount); assert.notEqual(one.items[0].id, two.items[0].id)
 assert.deepEqual((await get(`trips/${id}/assignments`).expect(200)).body, { items: [], pageInfo: { totalCount: 0, hasMore: false, nextCursor: null } })
 await get(`trips/${id}/assignments`, partner).expect(403)
})
async function freshNotification() {
 // Isolate the due queue within this test's disposable database.
 await db.client.notification.updateMany({ where: { status: 'pending' }, data: { status: 'sent', sentAt: new Date() } })
 const order = await received(); await decide(order.id, 'reject', order.etag).expect(200)
 return db.client.notification.findFirstOrThrow({ where: { orderId: order.id } })
}
test('outbox capture is durable/idempotent after provider acceptance and stale claims cannot acknowledge', async () => {
 const notification = await freshNotification(); const directory = await mkdtemp(join(tmpdir(), 'hired-order-capture-'))
 try {
  const transport = createCaptureTransport({ NODE_ENV: 'test', NOTIFICATION_TRANSPORT: 'capture', NOTIFICATION_CAPTURE_DIRECTORY: directory })
  const worker = createNotificationWorker(db.client, transport); const first = await worker.claim(); assert.equal(first?.id, notification.id)
  const message = await transport.send(first!) // Simulated crash after provider accepts, before acknowledgement.
  await db.client.notification.update({ where: { id: notification.id }, data: { leaseExpiresAt: new Date(0) } })
  const next = await worker.claim(); assert.equal(next?.id, notification.id); assert.notEqual(next?.leaseToken, first?.leaseToken)
  assert.equal((await worker.acknowledge(first!, message)).count, 0)
  assert.equal(await transport.send(next!), message); assert.equal((await worker.acknowledge(next!, message)).count, 1)
  assert.deepEqual(await readDirectory(directory), [`${notification.id}.json`])
  const saved = await db.client.notification.findUniqueOrThrow({ where: { id: notification.id } }); assert.equal(saved.status, 'sent'); assert.equal(saved.attemptCount, 2)
 } finally { await rm(directory, { recursive: true, force: true }) }
})
test('outbox failures apply bounded backoff, sanitize errors and permit audited retry without erasing attempts', async () => {
 const notification = await freshNotification(); const worker = createNotificationWorker(db.client, { send: async () => { throw new Error('private-provider-credential') } })
 for (let attempt = 1; attempt <= 5; attempt++) {
  const before = Date.now(); assert.equal(await worker.runOnce(), true)
  const row = await db.client.notification.findUniqueOrThrow({ where: { id: notification.id } })
  assert.equal(row.attemptCount, attempt); assert.equal(row.failureReason, 'DELIVERY_FAILED'); assert.equal(row.status, attempt === 5 ? 'failed' : 'pending')
  if (attempt < 5) { assert.ok(row.nextAttemptAt.getTime() >= before + [60,300,900,3600][attempt - 1]! * 1000); await db.client.notification.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(0) } }) }
 }
 assert.equal(await worker.runOnce(), false)
 const key = randomUUID(); const retry = () => request(app).post(`/api/v1/notifications/${notification.id}/retry`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key)
 const saved = (await retry().expect(200)).body; assert.equal(saved.attemptCount, 5); assert.equal(saved.status, 'pending'); assert.deepEqual((await retry().expect(200)).body, saved)
 await worker.runOnce(); assert.equal((await db.client.notification.findUniqueOrThrow({ where: { id: notification.id } })).attemptCount, 6)
 const audit = await get(`audit-logs?entityId=${notification.id}`).expect(200); assert.equal(audit.body.items[0].action, 'notification.retried'); assert.equal(audit.body.items[0].afterData, undefined)
})
test('simultaneous workers claim at most once and an expired fifth attempt becomes failed', async () => {
 const notification = await freshNotification(); const transport = { send: async () => 'synthetic-message' }; const one = createNotificationWorker(db.client, transport); const two = createNotificationWorker(db.client, transport)
 const claims = await Promise.all([one.claim(), two.claim()]); assert.equal(claims.filter(Boolean).length, 1)
 await db.client.notification.update({ where: { id: notification.id }, data: { attemptCount: 5, leaseExpiresAt: new Date(0) } })
 assert.equal(await one.claim(), null)
 const row = await db.client.notification.findUniqueOrThrow({ where: { id: notification.id } }); assert.equal(row.status, 'failed'); assert.equal(row.failureReason, 'ATTEMPT_LIMIT_REACHED')
})
test('notification reads/retry and audit reads are admin-only and omit worker/payload secrets', async () => {
 const notification = await freshNotification()
 for (const path of ['notifications', `notifications/${notification.id}`, 'audit-logs']) await get(path, partner).expect(403)
 const row = (await get(`notifications/${notification.id}`).expect(200)).body
 for (const field of ['payload','leaseToken','leaseExpiresAt','providerMessageId','deduplicationKey']) assert.equal(row[field], undefined)
 const list = (await get(`notifications?companyIds=${companyId}&limit=1`).expect(200)).body; assert.equal(list.items.length, 1); assert.ok(list.pageInfo.totalCount > 1)
 await request(app).post(`/api/v1/notifications/${notification.id}/retry`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID()).expect(409)
 const logs = (await get('audit-logs?limit=1').expect(200)).body
 const next = (await get(`audit-logs?limit=1&cursor=${encodeURIComponent(logs.pageInfo.nextCursor)}`).expect(200)).body
 assert.notEqual(logs.items[0].id, next.items[0].id); assert.equal(logs.pageInfo.totalCount, next.pageInfo.totalCount); assert.match(logs.items[0].createdAt, /\.[0-9]{6}Z$/)
 await get(`audit-logs?entityType=order&cursor=${encodeURIComponent(logs.pageInfo.nextCursor)}`).expect(422)
})
