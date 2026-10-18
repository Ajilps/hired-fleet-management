import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { before, after, test } from 'node:test'
import { Client } from 'pg'
import { Router } from 'express'
import request from 'supertest'
import { createApp } from '../../src/app.ts'
import { createDatabase } from '../../src/database/database-client.ts'
import { readEnvironment } from '../../src/config/environment.ts'
import { createAuthRouter, readAuthConfig } from '../../src/modules/auth/index.ts'
import { hashPassword } from '../../src/modules/auth/password-service.ts'
import { createFileRouter } from '../../src/modules/files/index.ts'

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must identify disposable PostgreSQL with CREATE DATABASE permission.')
const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL }); const databaseName = `hired_files_${randomBytes(6).toString('hex')}`
const url = new URL(process.env.TEST_DATABASE_URL); url.pathname = `/${databaseName}`
const database = createDatabase(readEnvironment({ NODE_ENV: 'test', DATABASE_URL: url.toString() })); const sql = new Client({ connectionString: url.toString() })
const auth = readAuthConfig({ AUTH_SESSION_KEY: randomBytes(32).toString('base64url'), AUTH_LOGIN_IP_LIMIT: '1000', AUTH_LOGIN_ACCOUNT_LIMIT: '100' })
const password = 'synthetic private file password'; let hash: string; let app: ReturnType<typeof createApp>
type Fixture = { id: string; driverId: string | null; token: string }
let owner: Fixture; let other: Fixture; let driver: Fixture; let foreignDriver: Fixture; let partner: Fixture; let restricted: Fixture
async function fixture(role: 'admin' | 'driver' | 'partner', passwordChangeRequired = false): Promise<Fixture> {
  const id = randomUUID(); const driverId = role === 'driver' ? randomUUID() : null
  await sql.query(`INSERT INTO users(id,email,password_hash,role,full_name,password_change_required,created_at,updated_at) VALUES($1,$2,$3,$4,'Synthetic File User',$5,now(),now())`,[id,`synthetic-${id}@example.test`,hash,role,passwordChangeRequired])
  if (driverId) await sql.query('INSERT INTO drivers(id,user_id,created_at,updated_at) VALUES($1,$2,now(),now())',[driverId,id])
  if (role === 'partner') {
    const companyId = randomUUID()
    await sql.query(`INSERT INTO companies(id,legal_name,display_name,contact_name,contact_email,contact_phone,billing_address,created_at,updated_at) VALUES($1,'Synthetic','Synthetic','Synthetic','synthetic@example.test','synthetic','synthetic',now(),now())`,[companyId])
    await sql.query('INSERT INTO company_users(company_id,user_id,created_at) VALUES($1,$2,now())',[companyId,id])
  }
  const response = await request(app).post('/api/v1/auth-sessions/login').send({email:`synthetic-${id}@example.test`,password,transport:'token'}).expect(200)
  return { id, driverId, token: response.body.accessToken }
}
async function asset(uploader = owner, target = driver, status = 'pending') {
  const id = randomUUID()
  await sql.query(`INSERT INTO file_assets(id,storage_key,original_filename,mime_type,byte_size,checksum_sha256,malware_scan_status,purpose,driver_id,uploaded_by_user_id,created_at) VALUES($1,$2,'synthetic.pdf','application/pdf',123,$3,$4,'driver_document',$5,$6,'2026-10-18T00:00:00.123456Z')`, [id,`quarantine/${id}`,'a'.repeat(64),status,target.driverId,uploader.id])
  return id
}
function get(id: string, actor = owner) { return request(app).get(`/api/v1/file-assets/${id}`).set('Authorization', `Bearer ${actor.token}`) }
before(async () => {
  await admin.connect(); await admin.query(`CREATE DATABASE "${databaseName}"`); await sql.connect()
  const migrations = (await readdir(new URL('../../prisma/migrations/', import.meta.url))).filter((name) => name !== 'migration_lock.toml').sort()
  for (const migration of migrations.filter((name) => name < '20261018060000_add_private_file_assets')) await sql.query(await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8'))
  hash = await hashPassword(password)
  const router = Router(); router.use(await createAuthRouter(database.client, auth, [])); router.use(createFileRouter(database.client, auth))
  app = createApp({ corsOrigins: [] }, database, () => false, router)
  owner = await fixture('admin'); other = await fixture('admin'); driver = await fixture('driver'); foreignDriver = await fixture('driver'); partner = await fixture('partner'); restricted = await fixture('driver',true)
  await sql.query(`INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,created_at) VALUES($1,'fixture',$1,'file.fixture.prior',now())`,[owner.id])
  await sql.query(await readFile(new URL('../../prisma/migrations/20261018060000_add_private_file_assets/migration.sql', import.meta.url), 'utf8'))
  await sql.query(await readFile(new URL('../../prisma/migrations/20261018061500_add_file_upload_intents/migration.sql', import.meta.url), 'utf8'))
})
after(async () => { await database.close(); await sql.end(); await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH(FORCE)`); await admin.end() })

test('file migration preserves populated identity/driver/audit data and requires the new relation for readiness', async () => {
  assert.equal((await database.client.user.findUniqueOrThrow({where:{id:owner.id}})).passwordHash,hash)
  assert.equal(await database.client.driver.count(),3); assert.equal(await database.client.auditLog.count({where:{action:'file.fixture.prior'}}),1)
  await request(app).get('/ready').expect(200)
  await sql.query('ALTER TABLE file_assets RENAME TO file_assets_unavailable')
  try { await request(app).get('/ready').expect(503) } finally { await sql.query('ALTER TABLE file_assets_unavailable RENAME TO file_assets') }
  await request(app).get('/ready').expect(200)
})
test('unattached metadata is uploader-only, including admin and target-driver boundaries', async () => {
  const adminAsset = await asset(); const ownAsset = await asset(driver,driver)
  const response = await get(adminAsset).expect(200); assert.equal(response.headers['cache-control'],'no-store'); assert.equal(response.body.scanStatus,'pending'); assert.equal(response.body.sizeBytes,123)
  assert.deepEqual(Object.keys(response.body).sort(),['id','originalFilename','mimeType','sizeBytes','checksumSha256','scanStatus','uploadedByUserId','createdAt'].sort())
  assert.equal(JSON.stringify(response.body).includes('quarantine/'),false)
  await get(ownAsset,driver).expect(200)
  for (const actor of [other,driver,foreignDriver,partner]) {
    const foreign = await get(adminAsset,actor).expect(404); const absent = await get(randomUUID(),actor).expect(404)
    assert.deepEqual(foreign.body.error, { ...absent.body.error, requestId: foreign.body.error.requestId })
  }
  await get(ownAsset).expect(404); await get(ownAsset,foreignDriver).expect(404)
  // Owner metadata can expose an honest pending/rejected result, never file bytes.
  for (const status of ['clean','rejected']) assert.equal((await get(await asset(driver,driver,status),driver).expect(200)).body.scanStatus,status)
})
test('current password setup, account and session state are enforced on every metadata read', async () => {
  const id = await asset(restricted,restricted); await get(id,restricted).expect(403)
  const own = await asset(driver,driver)
  await sql.query('UPDATE users SET is_active=false WHERE id=$1',[driver.id])
  try { await get(own,driver).expect(401) } finally { await sql.query('UPDATE users SET is_active=true WHERE id=$1',[driver.id]) }
  await sql.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1',[driver.id]); await get(own,driver).expect(401)
  await request(app).get(`/api/v1/file-assets/${own}`).expect(401)
})
test('database rejects forged ownership/context, missing relations and unsafe metadata', async () => {
  await assert.rejects(asset(driver,foreignDriver),{code:'23514'}); await assert.rejects(asset(partner,driver),{code:'23514'})
  await assert.rejects(asset(owner,{...driver,driverId:randomUUID()}),{code:'23503'})
  const id=await asset()
  for (const assignment of ["byte_size=0","byte_size=9007199254740992","checksum_sha256='invalid'","malware_scan_status='unknown'","purpose='trip_selfie'","original_filename=''","mime_type=''"]) {
    await assert.rejects(sql.query(`UPDATE file_assets SET ${assignment} WHERE id=$1`,[id]),{code:'23514'})
  }
  for (const assignment of ["driver_id=$2","uploaded_by_user_id=$2"]) await assert.rejects(sql.query(`UPDATE file_assets SET ${assignment} WHERE id=$1`,[id,assignment.startsWith('driver')?foreignDriver.driverId:other.id]),{code:'23514'})
  await assert.rejects(sql.query('DELETE FROM drivers WHERE id=$1',[driver.driverId]),{code:'23001'})
  await sql.query("UPDATE file_assets SET malware_scan_status='rejected' WHERE id=$1",[id])
  await assert.rejects(sql.query("UPDATE file_assets SET malware_scan_status='clean' WHERE id=$1",[id]),{code:'23514'})
})
