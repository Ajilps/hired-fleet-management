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
import { hashPassword, verifyPassword } from '../../src/modules/auth/password-service.ts'
import { createDriverRouter } from '../../src/modules/drivers/index.ts'
import { createAccountRouter } from '../../src/modules/accounts/index.ts'
import { createCompanyRouter } from '../../src/modules/companies/index.ts'

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must identify disposable PostgreSQL with CREATE DATABASE permission.')
const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL }); const databaseName = `hired_drivers_${randomBytes(6).toString('hex')}`
const url = new URL(process.env.TEST_DATABASE_URL); url.pathname = `/${databaseName}`
const database = createDatabase(readEnvironment({ NODE_ENV: 'test', DATABASE_URL: url.toString() })); const sql = new Client({ connectionString: url.toString() })
const auth = readAuthConfig({ AUTH_SESSION_KEY: randomBytes(32).toString('base64url'), AUTH_LOGIN_IP_LIMIT: '1000', AUTH_LOGIN_ACCOUNT_LIMIT: '100', AUTH_REFRESH_IP_LIMIT: '1000' })
const origin = 'http://localhost:5173'; const password = '  synthetic driver initial password  '; const nextPassword = 'synthetic driver chosen password'; const actorId = randomUUID(); const orphanId = randomUUID(); let actor: string
let app: ReturnType<typeof createApp>; let hash: string
const root = fileURLToPath(new URL('../../', import.meta.url)); const env = { ...process.env, DATABASE_URL: url.toString(), MIGRATION_DATABASE_URL: url.toString() }
async function fixture(role = 'admin') { const id = randomUUID(); await sql.query(`INSERT INTO users(id,email,password_hash,role,full_name,created_at,updated_at) VALUES ($1,$2,$3,$4,'Synthetic fixture',now(),now())`, [id, `synthetic-${id}@example.test`, hash, role]); return id }
function input() { return { fullName: 'Synthetic Invited Driver', email: `driver-${randomUUID()}@example.test`, phone: '+91 synthetic', initialPassword: password, dateOfBirth: '2000-02-29', homeAddress: 'Synthetic address' } }
function create(body = input(), key = randomUUID(), token = actor) { return request(app).post('/api/v1/drivers').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body) }
function get(path: string, token = actor) { return request(app).get(`/api/v1/${path}`).set('Authorization', `Bearer ${token}`) }
function login(email: string, credential = password, transport = 'token') { return request(app).post('/api/v1/auth-sessions/login').set('Origin', origin).set('X-CSRF-Guard','1').send({ email, password: credential, transport }) }
function counts() { return Promise.all([database.client.user.count(), database.client.driver.count(), database.client.auditLog.count(), database.client.commandReplay.count()]) }
before(async () => {
 await admin.connect(); await admin.query(`CREATE DATABASE "${databaseName}"`); await sql.connect()
 for (const migration of ['20261017120952_create_identity_tables','20261017125940_add_auth_session_security','20261017134500_add_durable_commands','20261017141500_add_companies_and_rates','20261017152000_add_partner_password_lifecycle','20261017161000_add_user_directory_index']) {
  await sql.query(await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8'))
  await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js','migrate','resolve','--applied',migration], { cwd: root, env })
 }
 hash = await hashPassword(password)
 for (const [id,role] of [[actorId,'admin'],[orphanId,'driver']]) await sql.query(`INSERT INTO users(id,email,password_hash,role,full_name,created_at,updated_at) VALUES ($1,$2,$3,$4,'Synthetic prior account','2026-01-01T00:00:00.123456Z',now())`, [id, `synthetic-${id}@example.test`, hash, role])
 await sql.query(`INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,created_at) VALUES ($1,'fixture',$1,'fixture.prior',now())`, [actorId])
 for (let index=0; index<2; index++) await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js','migrate','deploy'], { cwd: root, env })
 const router = Router(); router.use(await createAuthRouter(database.client, auth, [origin])); router.use(createAccountRouter(database.client, auth, randomBytes(32))); router.use(createCompanyRouter(database.client, auth, randomBytes(32))); router.use(createDriverRouter(database.client, auth, randomBytes(32)))
 app = createApp({ corsOrigins: [origin] }, database, () => false, router)
 actor = (await login(`synthetic-${actorId}@example.test`).expect(200)).body.accessToken
})
after(async () => { await database.close(); await sql.end(); await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`); await admin.end() })

test('populated driver migration preserves prior accounts, hashes, audit and orphan denial without fabricating profiles', async () => {
 assert.equal((await database.client.user.findUniqueOrThrow({ where: { id: actorId } })).passwordHash, hash)
 assert.equal(await database.client.auditLog.count({ where: { action: 'fixture.prior' } }),1)
 assert.equal(await database.client.driver.count(),0)
 await login(`synthetic-${orphanId}@example.test`).expect(403)
 await request(app).get('/ready').expect(200)
})
test('public signup is explicitly disabled and strict admin provisioning cannot assign privilege or operational state', async () => {
 const before = await counts(); await request(app).post('/api/v1/driver-applications').send({ email: input().email, password }).expect(403)
 await request(app).post('/api/v1/drivers').send(input()).expect(401)
 for (const extra of [{ role: 'admin' },{ status: 'active' },{ isOnline: true },{ userId: actorId },{ activatedByUserId: actorId },{ passwordChangeRequired: false },{ dateOfBirth: '2030-02-30' },{ phone: '' }]) await create({ ...input(), ...extra } as ReturnType<typeof input>).expect(422)
 await request(app).post('/api/v1/drivers').set('Authorization',`Bearer ${actor}`).send(input()).expect(422)
 assert.deepEqual(await counts(),before)
})
test('admin provision creates pending/offline restricted identity, safe audit and durable replay atomically', async () => {
 const body=input(); body.email=body.email.toUpperCase(); const key=randomUUID(); const before=await counts(); const saved=await create(body,key).expect(201)
 assert.equal(saved.body.user.email,body.email.toLowerCase()); assert.equal(saved.body.user.driverId,saved.body.id); assert.equal(saved.body.user.companyId,null); assert.equal(saved.body.status,'pending'); assert.equal(saved.body.isOnline,false); assert.equal(saved.body.onboardedAt,null); assert.equal(saved.body.activatedByUserId,null); assert.equal(saved.body.user.passwordChangeRequired,true)
 assert.equal(saved.headers.location,`/api/v1/drivers/${saved.body.id}`); assert.deepEqual((await create(body,key).expect(201)).body,saved.body)
 assert.deepEqual(await counts(),before.map((count)=>count+1))
 const user=await database.client.user.findUniqueOrThrow({ where: { id: saved.body.user.id } }); assert.notEqual(user.passwordHash,password); assert.equal(await verifyPassword(user.passwordHash,password),true)
 const replay=await database.client.commandReplay.findFirstOrThrow({ where: { canonicalPath:'/api/v1/drivers',idempotencyKey:key } }); const audit=await database.client.auditLog.findFirstOrThrow({ where: { entityId:saved.body.id } })
 for (const record of [saved.body,replay.responseBody,audit.afterData]) { const text=JSON.stringify(record); assert.equal(text.includes(password),false); assert.equal(text.includes(user.passwordHash),false); assert.equal(text.includes('refreshToken'),false) }
 assert.equal(JSON.stringify(audit.afterData).includes(body.homeAddress),false)
 await create({ ...body,fullName:'Changed intent' },key).expect(409)
})
test('duplicate intents and normalized emails cannot produce two driver profiles or overwrite any existing role', async () => {
 const body=input(); const key=randomUUID(); const responses=await Promise.all([create(body,key),create(body,key)])
 assert.equal(responses.filter((response)=>response.status===201).length>=1,true); for (const response of responses) assert.equal([201,409].includes(response.status),true)
 await create(body,key).expect(201); assert.equal(await database.client.user.count({ where: { email:body.email } }),1)
 const duplicate=input(); const conflicting=await Promise.all([create(duplicate),create({ ...duplicate,email:duplicate.email.toUpperCase() })]); assert.deepEqual(conflicting.map((response)=>response.status).sort(),[201,409])
 await create({ ...input(),email:`synthetic-${actorId}@example.test` }).expect(409); assert.equal((await database.client.user.findUniqueOrThrow({ where:{id:actorId} })).role,'Admin')
})
test('native first-login change revokes every session and fresh pending driver can read only its own onboarding profile', async () => {
 const body=input(); const key=randomUUID(); const saved=(await create(body,key).expect(201)).body
 const old=(await login(body.email).expect(200)).body; const browser=await login(body.email,password,'browser').expect(200)
 assert.equal(old.user.driverId,saved.id); assert.equal(old.user.passwordChangeRequired,true); await get('users/me',old.accessToken).expect(200); await get('drivers/me',old.accessToken).expect(403)
 await request(app).post('/api/v1/users/me/password').set('Authorization',`Bearer ${old.accessToken}`).send({ currentPassword:password,newPassword:nextPassword }).expect(204)
 await get('users/me',old.accessToken).expect(401); await get('users/me',browser.body.accessToken).expect(401)
 await request(app).post('/api/v1/auth-sessions/refresh').send({ refreshToken:old.refreshToken }).expect(401)
 const fresh=(await login(body.email,nextPassword).expect(200)).body; const own=await get('drivers/me',fresh.accessToken).expect(200); assert.equal(own.body.id,saved.id); assert.equal(own.body.status,'pending'); assert.equal(own.body.user.passwordChangeRequired,false)
 for (const path of ['drivers',`drivers/${saved.id}`,'users','companies',`companies/${randomUUID()}`]) await get(path,fresh.accessToken).expect(403)
 await create(input(),randomUUID(),fresh.accessToken).expect(403)
 await request(app).post('/api/v1/companies').set('Authorization',`Bearer ${fresh.accessToken}`).set('Idempotency-Key',randomUUID()).send({ legalName:'Synthetic Company',displayName:'Synthetic Company',contactName:'Synthetic Contact',contactEmail:'contact@example.test',contactPhone:'synthetic',billingAddress:'Synthetic address',initialPayoutRate:{driverPercent:'50.00',companyPercent:'50.00'} }).expect(403)
 const replay=await create(body,key).expect(201); assert.deepEqual(replay.body,saved); assert.equal((await get(`drivers/${saved.id}`).expect(200)).body.user.passwordChangeRequired,false)
 assert.equal((await get(`users/${saved.user.id}`).expect(200)).body.driverId,saved.id)
 const refreshed=(await request(app).post('/api/v1/auth-sessions/refresh').send({refreshToken:fresh.refreshToken}).expect(200)).body; assert.equal(refreshed.user.driverId,saved.id)
})
test('browser driver password change enforces origin/CSRF, clears cookie and requires fresh credentials', async () => {
 const body=input(); const driver=(await create(body).expect(201)).body; const browser=await login(body.email,password,'browser').expect(200)
 assert.equal(browser.body.refreshToken,undefined); const cookie=browser.headers['set-cookie']![0]!.split(';')[0]!
 await request(app).post('/api/v1/users/me/password').set('Authorization',`Bearer ${browser.body.accessToken}`).send({ currentPassword:password,newPassword:nextPassword }).expect(403)
 const changed=await request(app).post('/api/v1/users/me/password').set('Authorization',`Bearer ${browser.body.accessToken}`).set('Origin',origin).set('X-CSRF-Guard','1').set('Cookie',cookie).send({ currentPassword:password,newPassword:nextPassword }).expect(204)
 assert.match(changed.headers['set-cookie']![0]!,/Expires=Thu, 01 Jan 1970/); await login(body.email).expect(401)
 const fresh=(await login(body.email,nextPassword,'browser').expect(200)).body; assert.equal((await get('drivers/me',fresh.accessToken).expect(200)).body.id,driver.id)
})
test('account disable revokes driver credentials without activating or changing profile state; enable cannot resurrect them', async () => {
 const body=input(); const driver=(await create(body).expect(201)).body; const old=(await login(body.email).expect(200)).body
 const status=(isActive:boolean)=>request(app).patch(`/api/v1/users/${driver.user.id}/status`).set('Authorization',`Bearer ${actor}`).set('Idempotency-Key',randomUUID()).send({isActive,reason:'Synthetic driver account status'})
 await status(false).expect(200); await get('users/me',old.accessToken).expect(401); await login(body.email).expect(401)
 const profile=(await get(`drivers/${driver.id}`).expect(200)).body; assert.equal(profile.status,'pending'); assert.equal(profile.user.isActive,false); assert.equal(profile.onboardedAt,null)
 await status(true).expect(200); await get('users/me',old.accessToken).expect(401); assert.equal((await login(body.email).expect(200)).body.user.driverId,driver.id)
})
test('signed directory cursors preserve microseconds/ties, filters, total counts and actor/collection scope', async () => {
 const ids:string[]=[]
 for(let index=0;index<4;index++){const driver=(await create(input()).expect(201)).body;ids.push(driver.id);await sql.query("UPDATE drivers SET created_at=$2 WHERE id=$1",[driver.id,index<2?'2027-01-01T00:00:00.123456Z':'2027-01-01T00:00:00.123123Z'])}
 const seen:string[]=[];let cursor='';let first='';let total:number
 do {const response=await get(`drivers?status=pending&isOnline=false&limit=1${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`).expect(200); total=response.body.pageInfo.totalCount;seen.push(...response.body.items.map((item:{id:string})=>item.id));cursor=response.body.pageInfo.nextCursor??'';if(!first)first=cursor}while(cursor)
 assert.equal(new Set(seen).size,total);for(const id of ids)assert.equal(seen.includes(id),true)
 for(const query of ['status=active&isOnline=false','status=pending&isOnline=true','status=pending'])await get(`drivers?${query}&cursor=${encodeURIComponent(first)}`).expect(422)
 await get(`users?cursor=${encodeURIComponent(first)}`).expect(422)
 const second=await fixture();const secondToken=(await login(`synthetic-${second}@example.test`).expect(200)).body.accessToken
 await get(`drivers?status=pending&isOnline=false&cursor=${encodeURIComponent(first)}`,secondToken).expect(422)
 assert.equal((await get('drivers?isOnline=true').expect(200)).body.pageInfo.totalCount,0)
 for(const query of ['isOnline=0','limit=101','status=unknown','search=unsupported'])await get(`drivers?${query}`).expect(422)
})
test('driver creation rolls back user/profile/audit/replay on profile, audit and replay persistence failures', async () => {
 for(const table of ['drivers','audit_logs','command_replays']) {
  const body=input();const key=randomUUID();const before=await counts()
  await sql.query(`CREATE FUNCTION fail_driver_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER trg_fail_driver_test BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_driver_test();`)
  try {await create(body,key).expect(500);assert.deepEqual(await counts(),before)}finally{await sql.query(`DROP TRIGGER trg_fail_driver_test ON ${table}; DROP FUNCTION fail_driver_test()`)}
  await create(body,key).expect(201)
 }
})
test('database enforces one profile per driver account and prevents a role change from fabricating admin access', async () => {
 const driver=(await create(input()).expect(201)).body
 await assert.rejects(sql.query(`INSERT INTO drivers(id,user_id,created_at,updated_at) VALUES ($1,$2,now(),now())`,[randomUUID(),actorId]),{code:'23514'})
 await assert.rejects(sql.query(`INSERT INTO drivers(id,user_id,created_at,updated_at) VALUES ($1,$2,now(),now())`,[randomUUID(),driver.user.id]),{code:'23505'})
 await assert.rejects(sql.query("UPDATE users SET role='admin' WHERE id=$1",[driver.user.id]),{code:'23514'})
})
test('readiness requires the new driver schema and recovers when it is restored', async () => {
 await sql.query('ALTER TABLE drivers RENAME TO drivers_unavailable')
 try {await request(app).get('/ready').expect(503)} finally {await sql.query('ALTER TABLE drivers_unavailable RENAME TO drivers')}
 await request(app).get('/ready').expect(200)
})
