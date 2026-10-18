import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { before, after, test } from 'node:test'
import { Client } from 'pg'
import { Router } from 'express'
import request from 'supertest'
import { createApp } from '../../src/app.ts'
import { createDatabase } from '../../src/database/database-client.ts'
import { readEnvironment } from '../../src/config/environment.ts'
import { createAuthRouter, readAuthConfig } from '../../src/modules/auth/index.ts'
import { hashPassword } from '../../src/modules/auth/password-service.ts'
import { createFileRouter, createPrivateObjectStore, readStorageConfig, createClamAvScanner, readScannerConfig } from '../../src/modules/files/index.ts'
import { HttpError } from '../../src/shared/http/http-error.ts'
import { MAX_UPLOAD_BYTES } from '../../src/modules/files/upload-policy.ts'

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must identify disposable PostgreSQL with CREATE DATABASE permission.')
const isLive = process.env.TEST_FILES_LIVE === 'true'
if (isLive && (!process.env.TEST_STORAGE_ENDPOINT || !['127.0.0.1','localhost','[::1]'].includes(new URL(process.env.TEST_STORAGE_ENDPOINT).hostname) || !['127.0.0.1','localhost','::1'].includes(process.env.CLAMAV_HOST ?? '127.0.0.1'))) throw new Error('Live file tests require explicit loopback storage and scanner endpoints.')
const admin = new Client({connectionString:process.env.TEST_DATABASE_URL});const name=`hired_uploads_${randomBytes(6).toString('hex')}`;const url=new URL(process.env.TEST_DATABASE_URL);url.pathname=`/${name}`
const sql=new Client({connectionString:url.toString()});const database=createDatabase(readEnvironment({NODE_ENV:'test',DATABASE_URL:url.toString()}))
const auth=readAuthConfig({AUTH_SESSION_KEY:randomBytes(32).toString('base64url'),AUTH_LOGIN_IP_LIMIT:'1000',AUTH_LOGIN_ACCOUNT_LIMIT:'100'});const fingerprintKey=randomBytes(32)
const origin='http://localhost:5173';const password='synthetic file upload password';const pdf=Buffer.from('%PDF-1.4\nSynthetic private document\n%%EOF\n')
// Harmless industry antivirus test signature, embedded in synthetic PDF bytes.
const eicar=Buffer.from('WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=','base64')
const infected=Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${eicar.length} >>\nstream\n`),eicar,Buffer.from('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n')])
const memory=new Map<string,Buffer>();const touched=new Set<string>();let putCount=0;let scanCount=0;let hasPutFailure=false;let hasLostPutResponse=false;let hasScannerFailure=false
let scanHook:((bytes:Buffer)=>Promise<'clean'|'rejected'>)|undefined
const realStore=isLive?createPrivateObjectStore(readStorageConfig({...process.env,NODE_ENV:'test',STORAGE_ENDPOINT:process.env.TEST_STORAGE_ENDPOINT})):undefined
const realScanner=isLive?createClamAvScanner(readScannerConfig(process.env)):undefined
const dependencies={
 store:{
  async put(id:string,bytes:Uint8Array,maxBytes:number){
   putCount++;if(hasPutFailure)throw new HttpError(503,'STORAGE_UNAVAILABLE','Synthetic storage outage.',1)
   touched.add(id)
   let result:{storageKey:string;sizeBytes:number;checksumSha256:string}
   if(realStore)result=await realStore.put(id,bytes,maxBytes)
   else{if(memory.has(id))throw new HttpError(409,'STORAGE_OBJECT_EXISTS','Synthetic object exists.');memory.set(id,Buffer.from(bytes));result={storageKey:`quarantine/${id}`,sizeBytes:bytes.length,checksumSha256:createHash('sha256').update(bytes).digest('hex')}}
   if(hasLostPutResponse)throw new HttpError(503,'STORAGE_UNAVAILABLE','Synthetic response loss.',1)
   return result
  },
  async read(id:string,maxBytes:number,checksum:string){
   if(realStore)return realStore.read(id,maxBytes,checksum)
   const bytes=memory.get(id);if(!bytes||bytes.length>maxBytes||createHash('sha256').update(bytes).digest('hex')!==checksum)throw new HttpError(503,'STORAGE_UNAVAILABLE','Synthetic integrity failure.')
   return Buffer.from(bytes)
  },
 },
 scanner:{async scan(bytes:Buffer):Promise<'clean'|'rejected'>{scanCount++;if(hasScannerFailure)throw new HttpError(503,'SCANNER_UNAVAILABLE','Synthetic scanner outage.',1);if(scanHook)return scanHook(bytes);if(realScanner)return realScanner.scan(bytes);return bytes.includes(eicar)?'rejected':'clean'}},
}
type Actor={id:string;driverId:string|null;token:string}
let app:ReturnType<typeof createApp>;let alternate:ReturnType<typeof createApp>;let owner:Actor;let driver:Actor;let foreign:Actor;let partner:Actor;let restricted:Actor;let hash:string
async function actor(role:'admin'|'driver'|'partner',passwordChangeRequired=false,transport='token'):Promise<Actor>{
 const id=randomUUID();const driverId=role==='driver'?randomUUID():null
 await sql.query(`INSERT INTO users(id,email,password_hash,role,full_name,password_change_required,created_at,updated_at) VALUES($1,$2,$3,$4,'Synthetic Upload User',$5,now(),now())`,[id,`synthetic-${id}@example.test`,hash,role,passwordChangeRequired])
 if(driverId)await sql.query('INSERT INTO drivers(id,user_id,created_at,updated_at) VALUES($1,$2,now(),now())',[driverId,id])
 if(role==='partner'){const companyId=randomUUID();await sql.query(`INSERT INTO companies(id,legal_name,display_name,contact_name,contact_email,contact_phone,billing_address,created_at,updated_at) VALUES($1,'Synthetic','Synthetic','Synthetic','synthetic@example.test','synthetic','synthetic',now(),now())`,[companyId]);await sql.query('INSERT INTO company_users(company_id,user_id,created_at) VALUES($1,$2,now())',[companyId,id])}
 const response=await request(app).post('/api/v1/auth-sessions/login').set('Origin',origin).set('X-CSRF-Guard','1').send({email:`synthetic-${id}@example.test`,password,transport}).expect(200)
 return{id,driverId,token:response.body.accessToken}
}
function upload(key=randomUUID(),bytes=pdf,user=owner,target=driver.driverId!,server=app){
 const call=request(server).post('/api/v1/file-assets').set('Authorization',`Bearer ${user.token}`).set('Idempotency-Key',key).field('purpose','driver_document')
 if(user===owner)call.field('driverId',target)
 return call.attach('file',bytes,{filename:'synthetic.pdf',contentType:'image/png'})
}
async function intent(key:string,user=owner){return database.client.fileUploadIntent.findUniqueOrThrow({where:{actorUserId_idempotencyKey:{actorUserId:user.id,idempotencyKey:key}},include:{asset:true}})}
function gate(){let resolve!:()=>void;const promise=new Promise<void>((done)=>{resolve=done});return{promise,resolve}}
before(async()=>{
 await admin.connect();await admin.query(`CREATE DATABASE "${name}"`);await sql.connect()
 for(const migration of(await readdir(new URL('../../prisma/migrations/',import.meta.url))).filter((item)=>item!=='migration_lock.toml').sort())await sql.query(await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`,import.meta.url),'utf8'))
 hash=await hashPassword(password)
 async function create(){const router=Router();router.use(await createAuthRouter(database.client,auth,[origin]));router.use(createFileRouter(database.client,auth,{fingerprintKey,origins:[origin],dependencies,attemptsPerMinute:100}));return createApp({corsOrigins:[origin]},database,()=>false,router)}
 app=await create();alternate=await create();owner=await actor('admin');driver=await actor('driver');foreign=await actor('driver');partner=await actor('partner');restricted=await actor('driver',true)
})
after(async()=>{
 if(realStore){try{for(const id of touched)await realStore.remove(id)}finally{realStore.close()}}
 await database.close();await sql.end();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH(FORCE)`);await admin.end()
})
test('admin upload records inspected bytes, a clean result and exact durable replay without leaking object identity',async()=>{
 const key=randomUUID();const response=await upload(key).expect(201);const previousPut=putCount;const previousScan=scanCount
 assert.equal(response.body.scanStatus,'clean');assert.equal(response.body.mimeType,'application/pdf');assert.equal(response.body.sizeBytes,pdf.length);assert.equal(response.headers.location,`/api/v1/file-assets/${response.body.id}`);assert.equal(response.headers['cache-control'],'no-store')
 assert.deepEqual((await upload(key,pdf,owner,driver.driverId!,alternate).expect(201)).body,response.body);assert.equal(putCount,previousPut);assert.equal(scanCount,previousScan)
 const saved=await intent(key);assert.equal(saved.asset.driverId,driver.driverId);assert.ok(saved.completedAt);assert.equal(saved.leaseToken,null)
 const audit=await database.client.auditLog.findMany({where:{entityId:saved.assetId},orderBy:{id:'asc'}});assert.deepEqual(audit.map((row)=>row.action),['file.upload_reserved','file.scan_completed'])
 for(const projection of [response.body,...audit.map((row)=>row.afterData)]){const text=JSON.stringify(projection);for(const secret of ['quarantine/','synthetic.pdf','passwordHash','storageKey'])if(secret!=='synthetic.pdf'||projection!==response.body)assert.equal(text.includes(secret),false)}
 assert.equal(await database.client.commandReplay.count({where:{canonicalPath:'/api/v1/file-assets'}}),0)
 await upload(key,Buffer.concat([pdf,Buffer.from('changed')])).expect(409);await upload(key,pdf,owner,foreign.driverId!).expect(409)
})
test('driver uploads derive own pending profile and deny partner, restricted, suspended and forged context',async()=>{
 const own=await upload(randomUUID(),pdf,driver).expect(201);assert.equal((await database.client.fileAsset.findUniqueOrThrow({where:{id:own.body.id}})).driverId,driver.driverId)
 await upload(randomUUID(),pdf,partner).expect(403);await upload(randomUUID(),pdf,restricted).expect(403)
 await request(app).post('/api/v1/file-assets').set('Authorization',`Bearer ${driver.token}`).set('Idempotency-Key',randomUUID()).field('purpose','driver_document').field('driverId',foreign.driverId!).attach('file',pdf,'synthetic.pdf').expect(422)
 await sql.query("UPDATE drivers SET status='suspended' WHERE id=$1",[driver.driverId]);try{await upload(randomUUID(),pdf,driver).expect(403)}finally{await sql.query("UPDATE drivers SET status='pending' WHERE id=$1",[driver.driverId])}
 await upload(randomUUID(),pdf,owner,randomUUID()).expect(404)
})
test('multipart validation rejects unsupported context, duplicate fields, missing/extra files and invalid content without reserving an asset',async()=>{
 const before=await database.client.fileAsset.count()
 await request(app).post('/api/v1/file-assets').expect(401)
 await request(app).post('/api/v1/file-assets').set('Authorization',`Bearer ${owner.token}`).expect(422)
 const start=()=>request(app).post('/api/v1/file-assets').set('Authorization',`Bearer ${owner.token}`).set('Idempotency-Key',randomUUID())
 await start().field('purpose','trip_selfie').field('driverId',driver.driverId!).attach('file',pdf,'synthetic.pdf').expect(422)
 await start().field('purpose','driver_document').field('tripId',randomUUID()).attach('file',pdf,'synthetic.pdf').expect(422)
 await start().field('purpose','driver_document').field('purpose','driver_document').attach('file',pdf,'synthetic.pdf').expect(422)
 await start().field('purpose','driver_document').field('driverId',driver.driverId!).expect(422)
 await start().field('purpose','driver_document').attach('unexpected',pdf,'synthetic.pdf').expect(422)
 await start().field('purpose','driver_document').attach('file',pdf,'one.pdf').attach('file',pdf,'two.pdf').expect(422)
 await start().set('Content-Type','multipart/form-data').send('malformed').expect(400)
 await upload(randomUUID(),Buffer.from('arbitrary executable content')).expect(415)
 await upload(randomUUID(),Buffer.alloc(0)).expect(413)
 await upload(randomUUID(),Buffer.alloc(MAX_UPLOAD_BYTES+1)).expect(413)
 assert.equal(await database.client.fileAsset.count(),before)
 const maximum=Buffer.alloc(MAX_UPLOAD_BYTES,32);pdf.copy(maximum);const accepted=await upload(randomUUID(),maximum).expect(201);assert.equal(accepted.body.sizeBytes,MAX_UPLOAD_BYTES)
})
test('storage failure and successful PUT response loss retain one recoverable asset without overwriting bytes',async()=>{
 for(const mode of ['before','after']){
  const key=randomUUID();hasPutFailure=mode==='before';hasLostPutResponse=mode==='after'
  try{await upload(key).expect(503)}finally{hasPutFailure=false;hasLostPutResponse=false}
  const pending=await intent(key);assert.equal(pending.asset.malwareScanStatus,'pending');assert.equal(pending.completedAt,null);assert.equal(pending.leaseToken,null)
  const result=await upload(key).expect(201);assert.equal(result.body.id,pending.assetId);assert.equal(await database.client.auditLog.count({where:{entityId:pending.assetId}}),2)
 }
})
test('scanner outage stays pending and retries the same immutable object; rejected files remain terminal',async()=>{
 const key=randomUUID();hasScannerFailure=true;try{await upload(key).expect(503)}finally{hasScannerFailure=false}
 const pending=await intent(key);const metadata=await request(app).get(`/api/v1/file-assets/${pending.assetId}`).set('Authorization',`Bearer ${owner.token}`).expect(200);assert.equal(metadata.body.scanStatus,'pending')
 assert.equal((await upload(key).expect(201)).body.id,pending.assetId)
 const rejectedKey=randomUUID();await upload(rejectedKey,infected).expect(422);const rejected=await intent(rejectedKey);assert.equal(rejected.asset.malwareScanStatus,'rejected');assert.ok(rejected.completedAt)
 const previousPut=putCount;const previousScan=scanCount;await upload(rejectedKey,infected).expect(422);assert.equal(putCount,previousPut);assert.equal(scanCount,previousScan)
 await request(app).post(`/api/v1/file-assets/${rejected.assetId}/download-links`).set('Authorization',`Bearer ${owner.token}`).expect(404)
})
test('separate API instances exclude concurrent intents and recover expired claims without stale scan acknowledgements',async()=>{
 const key=randomUUID();const entered=gate();const release=gate();let calls=0
 scanHook=async()=>{calls++;if(calls===1){entered.resolve();await release.promise;return'rejected'}return'clean'}
 const first=upload(key).then((response)=>response)
 try{
  await entered.promise;await upload(key,pdf,owner,driver.driverId!,alternate).expect(409)
  const pending=await intent(key);await sql.query("UPDATE file_upload_intents SET lease_expires_at=now()-interval '1 second' WHERE asset_id=$1",[pending.assetId])
  const second=await upload(key,pdf,owner,driver.driverId!,alternate).expect(201);assert.equal(second.body.scanStatus,'clean')
  release.resolve();const original=await first;assert.equal(original.status,201);assert.deepEqual(original.body,second.body);assert.equal(await database.client.auditLog.count({where:{entityId:pending.assetId,action:'file.scan_completed'}}),1)
 }finally{release.resolve();scanHook=undefined;await first}
})
test('final authorization rejects revoked credentials and stored replays before any further storage work',async()=>{
 const user=await actor('driver');const key=randomUUID();const entered=gate();const release=gate()
 scanHook=async()=>{entered.resolve();await release.promise;return'clean'};const first=upload(key,pdf,user).then((response)=>response)
 try{await entered.promise;await sql.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1',[user.id]);release.resolve();assert.equal((await first).status,401)}finally{release.resolve();scanHook=undefined;await first}
 const pending=await intent(key,user);assert.equal(pending.asset.malwareScanStatus,'pending')
 user.token=(await request(app).post('/api/v1/auth-sessions/login').send({email:`synthetic-${user.id}@example.test`,password,transport:'token'}).expect(200)).body.accessToken
 await upload(key,pdf,user).expect(201);const previousPut=putCount
 await sql.query('UPDATE users SET is_active=false WHERE id=$1',[user.id]);await upload(key,pdf,user).expect(401);assert.equal(putCount,previousPut)
})
test('audit failures roll back reservation or completion while preserving a recoverable external object',async()=>{
 for(const action of ['file.upload_reserved','file.scan_completed']){
  const key=randomUUID();const before=await database.client.fileAsset.count();const previousPut=putCount
  await sql.query(`CREATE FUNCTION fail_file_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${action}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER trg_fail_file_audit_test BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_file_audit_test();`)
  try{await upload(key).expect(500)}finally{await sql.query('DROP TRIGGER trg_fail_file_audit_test ON audit_logs; DROP FUNCTION fail_file_audit_test()')}
  assert.equal(await database.client.fileAsset.count(),before+(action==='file.upload_reserved'?0:1))
  if(action==='file.upload_reserved')assert.equal(putCount,previousPut);else assert.equal((await intent(key)).asset.malwareScanStatus,'pending')
  await upload(key).expect(201)
 }
})
test('browser uploads require exact origin and CSRF before accepting file bytes',async()=>{
 const browser=await actor('driver',false,'browser');const previousPut=putCount
 await upload(randomUUID(),pdf,browser).expect(403);assert.equal(putCount,previousPut)
 const start=()=>request(app).post('/api/v1/file-assets').set('Authorization',`Bearer ${browser.token}`).set('Idempotency-Key',randomUUID()).set('X-CSRF-Guard','1')
 await start().set('Origin','https://foreign.example.test').field('purpose','driver_document').attach('file',pdf,'synthetic.pdf').expect(403)
 await start().set('Origin',origin).field('purpose','driver_document').attach('file',pdf,'synthetic.pdf').expect(201)
})
test('authenticated upload admission survives API instances and counts retries before reading bytes',async()=>{
 const user=await actor('driver');const router=Router();router.use(createFileRouter(database.client,auth,{fingerprintKey,origins:[origin],dependencies,attemptsPerMinute:2}));const limited=createApp({corsOrigins:[origin]},database,()=>false,router)
 const key=randomUUID();await upload(key,pdf,user,driver.driverId!,limited).expect(201);await upload(key,pdf,user,driver.driverId!,limited).expect(201)
 const previousPut=putCount;const denied=await upload(key,pdf,user,driver.driverId!,limited).expect(429);assert.equal(Number(denied.headers['retry-after'])>=1,true)
 await upload(key,pdf,user,driver.driverId!,alternate).expect(201) // A higher configured deployment limit is deliberate.
 assert.equal(putCount,previousPut)
 const secondRouter=Router();secondRouter.use(createFileRouter(database.client,auth,{fingerprintKey,origins:[origin],dependencies,attemptsPerMinute:2}));const restarted=createApp({corsOrigins:[origin]},database,()=>false,secondRouter)
 await upload(key,pdf,user,driver.driverId!,restarted).expect(429)
})
test('per-process admission bounds simultaneous multipart/scan work and recovers capacity',async()=>{
 const entered=gate();const release=gate();let count=0
 scanHook=async()=>{if(++count===4)entered.resolve();await release.promise;return'clean'}
 const requests=Array.from({length:4},()=>upload().then((response)=>response))
 try{await entered.promise;await upload().expect(503);release.resolve();for(const response of await Promise.all(requests))assert.equal(response.status,201)}finally{release.resolve();scanHook=undefined;await Promise.all(requests)}
 await upload().expect(201)
})
test('database preserves upload actor/key/fingerprint and completed identity',async()=>{
 const key=randomUUID();await upload(key).expect(201);const saved=await intent(key)
 for(const assignment of ["actor_user_id=$2","idempotency_key='changed'","request_fingerprint=repeat('b',64)","completed_at=NULL"]){
  await assert.rejects(sql.query(`UPDATE file_upload_intents SET ${assignment} WHERE asset_id=$1`,assignment.includes('$2')?[saved.assetId,foreign.id]:[saved.assetId]),{code:'23514'})
 }
})
