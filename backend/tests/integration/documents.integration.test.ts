import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { before, after, test } from 'node:test'
import { Client } from 'pg'
import { Router } from 'express'
import request from 'supertest'
import { createApp } from '../../src/app.ts'
import { createDatabase } from '../../src/database/database-client.ts'
import { readEnvironment } from '../../src/config/environment.ts'
import { readAuthConfig } from '../../src/modules/auth/index.ts'
import { hashPassword } from '../../src/modules/auth/password-service.ts'
import { signAccessToken } from '../../src/modules/auth/token-service.ts'
import { createDriverRouter } from '../../src/modules/drivers/index.ts'
import { createDocumentRouter, readDocumentCipher } from '../../src/modules/documents/index.ts'
import { createFileRouter, createPrivateObjectStore, readStorageConfig } from '../../src/modules/files/index.ts'

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must explicitly identify disposable PostgreSQL.')
const parent = new Client({ connectionString: process.env.TEST_DATABASE_URL }); const name = `hired_documents_${randomBytes(6).toString('hex')}`
const url = new URL(process.env.TEST_DATABASE_URL); url.pathname = `/${name}`
const sql = new Client({ connectionString: url.toString() }); const database = createDatabase(readEnvironment({ DATABASE_URL: url.toString(), NODE_ENV: 'test' }))
const auth = readAuthConfig({ AUTH_SESSION_KEY: randomBytes(32).toString('base64url') }); const key = randomBytes(32)
const cipher = readDocumentCipher({ DOCUMENT_NUMBER_ENCRYPTION_KEY: randomBytes(32).toString('base64url') })!
const origin = 'http://localhost:5173'; const rawNumber = 'SYNTHETIC-PRIVATE-NUMBER-998877'; const pdf = Buffer.from('%PDF-1.7\nSynthetic previously scanned document.\n%%EOF')
const objects: string[] = []; let realStore: ReturnType<typeof createPrivateObjectStore> | undefined
let app: ReturnType<typeof createApp>; let withoutProviders: ReturnType<typeof createApp>; let hash: string; let signCount = 0; let isSignFailure = false
let owner: Actor; let other: Actor; let administrator: Actor; let partner: Actor; let restricted: Actor; let priorAsset: string
const signer = { async signDownload(id: string, mimeType: string) {
  signCount++; if (isSignFailure) throw new Error('Synthetic signer failure')
  return realStore ? realStore.signDownload(id, mimeType) : { url: `https://synthetic.example.test/${id}?signed=synthetic`, expiresAt: new Date(Date.now() + 300_000).toISOString() }
} }
type Actor = { id: string; driverId: string | null; token: string; sessionId: string }
async function actor(role: 'admin' | 'driver' | 'partner' = 'driver', transport = 'token', required = false): Promise<Actor> {
  const id = randomUUID(); const driverId = role === 'driver' ? randomUUID() : null; const sessionId = randomUUID(); const expiresAt = new Date(Date.now() + 3600_000)
  await sql.query(`INSERT INTO users(id,email,password_hash,role,full_name,password_change_required,created_at,updated_at) VALUES($1,$2,$3,$4,'Synthetic Documents User',$5,now(),now())`, [id, `synthetic-${id}@example.test`, hash, role, required])
  if (driverId) await sql.query('INSERT INTO drivers(id,user_id,created_at,updated_at) VALUES($1,$2,now(),now())', [driverId, id])
  if (role === 'partner') {
    const companyId = randomUUID()
    await sql.query(`INSERT INTO companies(id,legal_name,display_name,contact_name,contact_email,contact_phone,billing_address,created_at,updated_at) VALUES($1,'Synthetic','Synthetic','Synthetic','synthetic@example.test','synthetic','synthetic',now(),now())`, [companyId])
    await sql.query('INSERT INTO company_users(company_id,user_id,created_at) VALUES($1,$2,now())', [companyId, id])
  }
  await database.client.authSession.create({ data: { id: sessionId, userId: id, refreshTokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'), transport, expiresAt, createdAt: new Date() } })
  return { id, driverId, sessionId, token: await signAccessToken(id, sessionId, expiresAt, auth) }
}
async function asset(uploader = owner, target = uploader, scanStatus = 'clean') {
  const id = randomUUID()
  if (realStore) { await realStore.put(id, pdf, 5242880); objects.push(id) }
  await database.client.fileAsset.create({ data: { id, storageKey: `quarantine/${id}`, originalFilename: 'synthetic.pdf', mimeType: 'application/pdf', byteSize: BigInt(pdf.length), checksumSha256: createHash('sha256').update(pdf).digest('hex'), malwareScanStatus: scanStatus, purpose: 'driver_document', driverId: target.driverId!, uploadedByUserId: uploader.id, createdAt: new Date() } })
  return id
}
function attach(fileAssetId: string, user = owner, documentType = 'pan', idempotencyKey = randomUUID(), extra: Record<string, unknown> = {}, server = app) { return request(server).post('/api/v1/drivers/me/documents').set('Authorization', `Bearer ${user.token}`).set('Idempotency-Key', idempotencyKey).send({ documentType, fileAssetId, ...extra }) }
function list(user = owner, path = '/drivers/me/documents') { return request(app).get(`/api/v1${path}`).set('Authorization', `Bearer ${user.token}`) }
function metadata(id: string, user = owner) { return request(app).get(`/api/v1/file-assets/${id}`).set('Authorization', `Bearer ${user.token}`) }
function link(id: string, user = owner, server = app) { return request(server).post(`/api/v1/file-assets/${id}/download-links`).set('Authorization', `Bearer ${user.token}`) }
function makeApp(withProviders = true) {
  const router = Router(); router.use(createDriverRouter(database.client, auth, key, [origin])); router.use(createDocumentRouter(database.client, auth, key, [origin], withProviders ? cipher : undefined)); router.use(createFileRouter(database.client, auth, undefined, { fingerprintKey: key, origins: [origin], signer: withProviders ? signer : undefined }))
  return createApp({ corsOrigins: [origin] }, database, () => false, router)
}
before(async () => {
  if (process.env.TEST_DOCUMENTS_LIVE === 'true') {
    if (!process.env.TEST_STORAGE_ENDPOINT || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.TEST_STORAGE_ENDPOINT).hostname)) throw new Error('Live document tests require explicit loopback TEST_STORAGE_ENDPOINT.')
    realStore = createPrivateObjectStore(readStorageConfig({ ...process.env, NODE_ENV: 'test', STORAGE_ENDPOINT: process.env.TEST_STORAGE_ENDPOINT, STORAGE_PUBLIC_ENDPOINT: process.env.TEST_STORAGE_ENDPOINT }))
  }
  await parent.connect(); await parent.query(`CREATE DATABASE "${name}"`); await sql.connect()
  const migrations = (await readdir(new URL('../../prisma/migrations/', import.meta.url))).filter(value => value !== 'migration_lock.toml').sort()
  for (const migration of migrations.filter(value => value < '20261018073000_add_driver_documents')) await sql.query(await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8'))
  hash = await hashPassword('Synthetic document test password')
  owner = await actor(); other = await actor(); administrator = await actor('admin'); partner = await actor('partner'); restricted = await actor('driver', 'token', true)
  priorAsset = await asset(); await sql.query(`INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,created_at) VALUES($1,'fixture',$1,'documents.prior',now())`, [owner.id])
  await sql.query(await readFile(new URL('../../prisma/migrations/20261018073000_add_driver_documents/migration.sql', import.meta.url), 'utf8'))
  await sql.query(await readFile(new URL('../../prisma/migrations/20261018074500_preserve_driver_activation/migration.sql', import.meta.url), 'utf8'))
  app = makeApp(); withoutProviders = makeApp(false)
})
after(async () => {
  if (realStore) { try { for (const id of objects) await realStore.remove(id) } finally { realStore.close() } }
  await database.close(); await sql.end(); await parent.query(`DROP DATABASE IF EXISTS "${name}" WITH(FORCE)`); await parent.end()
})
test('populated upgrade preserves prior records and readiness requires documents', async () => {
  assert.equal((await database.client.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash, hash)
  assert.equal((await database.client.fileAsset.findUniqueOrThrow({ where: { id: priorAsset } })).malwareScanStatus, 'clean')
  assert.equal(await database.client.auditLog.count({ where: { action: 'documents.prior' } }), 1)
  await request(app).get('/ready').expect(200); await sql.query('ALTER TABLE driver_documents RENAME TO driver_documents_unavailable')
  try { await request(app).get('/ready').expect(503); await request(app).get('/health').expect(200) } finally { await sql.query('ALTER TABLE driver_documents_unavailable RENAME TO driver_documents') }
})
test('attachment encrypts full numbers, masks responses and persists one audit/replay under retries', async () => {
  const commandKey = randomUUID(); const body = { documentNumber: rawNumber, expiresOn: '2030-12-31' }
  const first = await attach(priorAsset, owner, 'pan', commandKey, body).expect(201)
  assert.equal(first.body.maskedDocumentNumber, '****8877'); assert.equal(first.headers['cache-control'], 'no-store')
  const row = await database.client.driverDocument.findUniqueOrThrow({ where: { id: first.body.id } })
  assert.equal(cipher.decrypt(row.documentNumberCiphertext!, row.documentNumberKeyId!, { id: row.id, driverId: row.driverId, fileAssetId: row.fileAssetId, documentType: 'pan' }), rawNumber)
  assert.deepEqual((await attach(priorAsset, owner, 'pan', commandKey, body).expect(201)).body, first.body)
  const stored = await database.client.commandReplay.findMany({ where: { actorUserId: owner.id } }); const audit = await database.client.auditLog.findMany({ where: { entityId: row.id } })
  assert.equal(stored.length, 1); assert.equal(audit.length, 1)
  for (const value of [first.body, stored, audit]) { assert.equal(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item).includes(rawNumber), false); assert.equal(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item).includes(row.documentNumberCiphertext!), false) }
  await attach(priorAsset, owner, 'pan', commandKey, { documentNumber: 'different-synthetic-number' }).expect(409)
  await attach(await asset(), owner, 'pan').expect(409)
})
test('ownership blocks foreign/admin uploads and pending/rejected/unattached assets', async () => {
  for (const id of [await asset(other), await asset(administrator, owner), randomUUID()]) await attach(id, owner, 'pcc').expect(404)
  for (const status of ['pending', 'rejected']) await attach(await asset(owner, owner, status), owner, 'pcc').expect(409)
  for (const user of [administrator, partner, restricted]) await attach(await asset(), user, 'pcc').expect(403)
  for (const id of [await asset(), await asset(owner, owner, 'pending'), await asset(owner, owner, 'rejected'), randomUUID()]) { await link(id).expect(404); await link(id, administrator).expect(404) }
})
test('own/admin lists and attached metadata enforce driver/partner boundaries', async () => {
  const documents = await list().expect(200); assert.equal(documents.body.pageInfo.totalCount, 1)
  await list(other, `/drivers/${owner.driverId}/documents`).expect(403); await list(partner, `/drivers/${owner.driverId}/documents`).expect(403)
  await list(administrator, `/drivers/${randomUUID()}/documents`).expect(404)
  const adminList = await list(administrator, `/drivers/${owner.driverId}/documents?isCurrent=true`).expect(200); assert.equal(adminList.body.items[0].id, documents.body.items[0].id)
  await metadata(priorAsset, administrator).expect(200)
  for (const user of [other, partner]) { await metadata(priorAsset, user).expect(404); await link(priorAsset, user).expect(404) }
})
test('list cursors preserve microsecond ties and reject swapped scopes', async () => {
  const driver = await actor()
  for (const type of ['pan', 'pcc', 'aadhar']) await attach(await asset(driver), driver, type).expect(201)
  await sql.query('ALTER TABLE driver_documents DISABLE TRIGGER trg_driver_documents_preserve')
  try { await sql.query(`UPDATE driver_documents SET uploaded_at='2026-10-18T00:00:00.123456Z' WHERE driver_id=$1`, [driver.driverId]) } finally { await sql.query('ALTER TABLE driver_documents ENABLE TRIGGER trg_driver_documents_preserve') }
  const first = await list(driver, '/drivers/me/documents?limit=1&isCurrent=true').expect(200); const cursor = first.body.pageInfo.nextCursor
  const second = await list(driver, `/drivers/me/documents?limit=1&isCurrent=true&cursor=${cursor}`).expect(200)
  assert.notEqual(first.body.items[0].id, second.body.items[0].id); assert.equal(second.body.pageInfo.totalCount, 3)
  await list(driver, `/drivers/me/documents?isCurrent=false&cursor=${cursor}`).expect(422)
  await list(other, `/drivers/me/documents?isCurrent=true&cursor=${cursor}`).expect(422)
  await list(administrator, `/drivers/${driver.driverId}/documents?isCurrent=true&cursor=${cursor}`).expect(422)
  assert.equal((await list(driver, '/drivers/me/documents?isCurrent=false').expect(200)).body.pageInfo.totalCount, 0)
})
test('concurrent different-key attachments commit only one current type', async () => {
  const driver = await actor(); const ids = [await asset(driver), await asset(driver)]
  const blocker = new Client({ connectionString: url.toString() }); await blocker.connect()
  await blocker.query('BEGIN'); await blocker.query('SELECT id FROM drivers WHERE id=$1 FOR SHARE', [driver.driverId])
  const pending = ids.map(id => attach(id, driver, 'pan').then(response => response))
  // Hold a shared profile lock while both requests enter, exposing lock-upgrade races.
  await new Promise(resolve => setTimeout(resolve, 100)); await blocker.query('COMMIT'); await blocker.end()
  const responses = await Promise.all(pending)
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409])
  assert.equal(await database.client.driverDocument.count({ where: { driverId: driver.driverId!, isCurrent: true } }), 1)
  assert.equal(await database.client.commandReplay.count({ where: { actorUserId: driver.id } }), 1)
})
test('browser mutations require origin/CSRF; disabled and revoked credentials fail', async () => {
  const driver = await actor('driver', 'browser'); const id = await asset(driver)
  await attach(id, driver).expect(403); await attach(id, driver).set('Origin', origin).set('X-CSRF-Guard', '1').expect(201)
  await link(id, driver).expect(403); await link(id, driver).set('Origin', 'http://foreign.example.test').set('X-CSRF-Guard', '1').expect(403)
  await link(id, driver).set('Origin', origin).set('X-CSRF-Guard', '1').expect(200)
  await sql.query('UPDATE users SET is_active=false WHERE id=$1', [driver.id])
  try { await list(driver).expect(401); await link(id, driver).set('Origin', origin).set('X-CSRF-Guard', '1').expect(401) } finally { await sql.query('UPDATE users SET is_active=true WHERE id=$1', [driver.id]) }
  await sql.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1', [driver.sessionId]); await list(driver).expect(401)
})
test('signed links audit access without saving URLs and enforce provider boundaries', async () => {
  const beforeCount = signCount; const response = await link(priorAsset, administrator).expect(200)
  assert.equal(signCount, beforeCount + 1); assert.equal(response.headers['cache-control'], 'no-store'); assert.ok(Date.parse(response.body.expiresAt) - Date.now() <= 300_000)
  const events = await database.client.auditLog.findMany({ where: { entityId: priorAsset, action: 'file_asset.download_link_issued' } }); assert.ok(events.length); assert.equal(JSON.stringify(events, (_key, item) => typeof item === 'bigint' ? item.toString() : item).includes(response.body.url), false)
  await link(priorAsset, administrator, withoutProviders).expect(503)
  isSignFailure = true
  try { const failed = await link(priorAsset, administrator).expect(500); assert.equal(JSON.stringify(failed.body).includes('signed='), false) } finally { isSignFailure = false }
  if (realStore) {
    const transport = await fetch(response.body.url, { headers: { Origin: origin } }); assert.equal(transport.status, 200); assert.deepEqual(Buffer.from(await transport.arrayBuffer()), pdf); assert.equal(transport.headers.get('access-control-allow-origin'), origin)
    const tampered = new URL(response.body.url); tampered.searchParams.set('X-Amz-Expires', '301'); assert.equal((await fetch(tampered)).status, 403)
    const expired = await realStore.signDownload(priorAsset, 'application/pdf', new Date(Date.now() - 3600_000)); assert.equal((await fetch(expired.url)).status, 403)
  }
})
test('audit failure rolls attachment back and the same intent succeeds after recovery', async () => {
  const driver = await actor(); const id = await asset(driver); const commandKey = randomUUID()
  await sql.query(`CREATE FUNCTION reject_document_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'driver_document.attached' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER trg_document_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_document_test_audit()`)
  try { await attach(id, driver, 'pan', commandKey).expect(500) } finally { await sql.query('DROP TRIGGER trg_document_test_audit ON audit_logs; DROP FUNCTION reject_document_test_audit()') }
  assert.equal(await database.client.driverDocument.count({ where: { driverId: driver.driverId! } }), 0); assert.equal(await database.client.commandReplay.count({ where: { actorUserId: driver.id } }), 0)
  await attach(id, driver, 'pan', commandKey).expect(201)
})
test('database enforces attachment integrity and immutable encrypted records', async () => {
  for (const id of [await asset(other), await asset(owner, owner, 'pending')]) await assert.rejects(sql.query(`INSERT INTO driver_documents(id,driver_id,document_type,file_asset_id,uploaded_at) VALUES($1,$2,'pcc',$3,now())`, [randomUUID(), owner.driverId, id]), { code: '23514' })
  await assert.rejects(sql.query('UPDATE driver_documents SET file_asset_id=$1 WHERE file_asset_id=$2', [await asset(), priorAsset]), { code: '23514' })
  await assert.rejects(sql.query('DELETE FROM driver_documents WHERE file_asset_id=$1', [priorAsset]), { code: '23514' })
  await assert.rejects(sql.query(`UPDATE driver_documents SET document_number_ciphertext='unprotected-plaintext' WHERE file_asset_id=$1`, [priorAsset]), { code: '23514' })
})
test('missing encryption config refuses numbers but permits number-free attachments', async () => {
  const driver = await actor(); const id = await asset(driver)
  await attach(id, driver, 'pan', randomUUID(), { documentNumber: rawNumber }, withoutProviders).expect(503)
  const response = await attach(id, driver, 'pan', randomUUID(), {}, withoutProviders).expect(201); assert.equal(response.body.maskedDocumentNumber, null)
})

test('download audit failure returns no link and leaves no access event', async () => {
  const count = await database.client.auditLog.count({ where: { entityId: priorAsset, action: 'file_asset.download_link_issued' } })
  await sql.query(`CREATE FUNCTION reject_download_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'file_asset.download_link_issued' THEN RAISE EXCEPTION 'synthetic audit outage'; END IF; RETURN NEW; END; $$; CREATE TRIGGER trg_download_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_download_test_audit()`)
  try { const response = await link(priorAsset, administrator).expect(500); assert.equal(response.body.url, undefined) } finally { await sql.query('DROP TRIGGER trg_download_test_audit ON audit_logs; DROP FUNCTION reject_download_test_audit()') }
  assert.equal(await database.client.auditLog.count({ where: { entityId: priorAsset, action: 'file_asset.download_link_issued' } }), count)
})
test('revoked actors cannot replay attachment and admission prevents signing after the limit', async () => {
  const driver = await actor(); const id = await asset(driver); const commandKey = randomUUID()
  await attach(id, driver, 'pan', commandKey).expect(201)
  const limiter = createHmac('sha256', key).update(`download:${driver.id}`).digest('hex')
  await sql.query(`INSERT INTO auth_rate_limits(key_hash,attempts,window_ends_at) VALUES($1,60,now()+interval '1 minute')`, [limiter])
  const count = signCount; const limited = await link(id, driver).expect(429)
  assert.ok(Number(limited.headers['retry-after']) > 0); assert.equal(signCount, count)
  await sql.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1', [driver.sessionId])
  await attach(id, driver, 'pan', commandKey).expect(401)
  assert.equal(await database.client.driverDocument.count({ where: { driverId: driver.driverId! } }), 1)
})

function activate(driver: Actor, commandKey = randomUUID(), user = administrator, reason = 'Synthetic operational activation') {
  return request(app).patch(`/api/v1/drivers/${driver.driverId}/status`).set('Authorization', `Bearer ${user.token}`).set('Idempotency-Key', commandKey).send({ status: 'active', reason })
}
async function complete(driver: Actor) { for (const type of ['driving_license', 'aadhar', 'pan', 'pcc']) await attach(await asset(driver), driver, type).expect(201) }
test('initial activation requires four clean documents and an enabled account, then preserves identity under replay', async () => {
  const driver = await actor(); await activate(driver).expect(409)
  await complete(driver); await sql.query('UPDATE users SET is_active=false WHERE id=$1', [driver.id])
  try { await activate(driver).expect(409) } finally { await sql.query('UPDATE users SET is_active=true WHERE id=$1', [driver.id]) }
  const commandKey = randomUUID(); const first = await activate(driver, commandKey).expect(200)
  assert.equal(first.body.status, 'active'); assert.equal(first.body.activatedByUserId, administrator.id); assert.ok(first.body.onboardedAt); assert.equal(first.body.isOnline, false)
  assert.deepEqual((await activate(driver, commandKey).expect(200)).body, first.body)
  await activate(driver, commandKey, administrator, 'Changed activation reason').expect(409); await activate(driver).expect(409)
  assert.equal(await database.client.auditLog.count({ where: { entityId: driver.driverId!, action: 'driver.activated' } }), 1)
  await assert.rejects(sql.query('UPDATE drivers SET onboarded_at=now() WHERE id=$1', [driver.driverId]), { code: '23514' })
})
test('activation rejects driver/partner actors, historical documents and direct SQL bypass', async () => {
  const driver = await actor(); await complete(driver)
  await activate(driver, randomUUID(), driver).expect(403); await activate(driver, randomUUID(), partner).expect(403)
  await sql.query("UPDATE driver_documents SET is_current=false WHERE driver_id=$1 AND document_type='pan'", [driver.driverId])
  await activate(driver).expect(409)
  await assert.rejects(sql.query("UPDATE drivers SET status='active',onboarded_at=now(),activated_by_user_id=$1 WHERE id=$2", [administrator.id, driver.driverId]), { code: '23514' })
})
test('racing activations commit once and audit failures roll back the state and replay', async () => {
  const driver = await actor(); await complete(driver)
  const results = await Promise.all([activate(driver), activate(driver)])
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409])
  assert.equal(await database.client.auditLog.count({ where: { entityId: driver.driverId!, action: 'driver.activated' } }), 1)
  const failedDriver = await actor(); await complete(failedDriver); const key = randomUUID()
  await sql.query(`CREATE FUNCTION reject_activation_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'driver.activated' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER trg_activation_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_activation_test_audit()`)
  try { await activate(failedDriver, key).expect(500) } finally { await sql.query('DROP TRIGGER trg_activation_test_audit ON audit_logs; DROP FUNCTION reject_activation_test_audit()') }
  const untouched = await database.client.driver.findUniqueOrThrow({ where: { id: failedDriver.driverId! } }); assert.equal(untouched.status, 'Pending'); assert.equal(untouched.onboardedAt, null)
  await activate(failedDriver, key).expect(200)
})
test('browser activation requires the guard and rejects unsupported later status operations', async () => {
  const admin = await actor('admin', 'browser'); const driver = await actor(); await complete(driver)
  await activate(driver, randomUUID(), admin).expect(403)
  await activate(driver, randomUUID(), admin).set('Origin', origin).set('X-CSRF-Guard', '1').expect(200)
  await request(app).patch(`/api/v1/drivers/${driver.driverId}/status`).set('Authorization', `Bearer ${administrator.token}`).set('Idempotency-Key', randomUUID()).send({ status: 'suspended', reason: 'Synthetic unsupported transition' }).expect(422)
})
