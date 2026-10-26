import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { before, after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { createDatabase } from '../../src/database/database-client.ts'
import { readEnvironment } from '../../src/config/environment.ts'
import { readAuthConfig } from '../../src/modules/auth/index.ts'
import { signAccessToken } from '../../src/modules/auth/token-service.ts'
import { createCommandExecutor, aggregateEtag, requireAggregateMatch, nextAggregateVersion } from '../../src/modules/commands/index.ts'
import type { CommandInput, CommandOutcome } from '../../src/modules/commands/index.ts'
import { HttpError } from '../../src/shared/http/http-error.ts'

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must identify a disposable PostgreSQL service with CREATE DATABASE permission.')
const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL })
const databaseName = `hired_commands_${randomBytes(6).toString('hex')}`
const databaseUrl = new URL(process.env.TEST_DATABASE_URL); databaseUrl.pathname = `/${databaseName}`
const config = readEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl.toString() })
const database = createDatabase(config)
const otherDatabase = createDatabase(config)
const auth = readAuthConfig({ AUTH_SESSION_KEY: randomBytes(32).toString('base64url') })
const fingerprintKey = randomBytes(32)
const executeCommand = createCommandExecutor(database.client, { auth, fingerprintKey })
const executeOther = createCommandExecutor(otherDatabase.client, { auth, fingerprintKey })
let sql: Client
before(async () => {
  await admin.connect()
  await admin.query(`CREATE DATABASE "${databaseName}"`)
  sql = new Client({ connectionString: databaseUrl.toString() }); await sql.connect()
  for (const migration of ['20261017120952_create_identity_tables', '20261017125940_add_auth_session_security']) {
    await sql.query(await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8'))
    await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'resolve', '--applied', migration], { cwd: fileURLToPath(new URL('../../', import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl.toString(), MIGRATION_DATABASE_URL: databaseUrl.toString() } })
  }
  await sql.query(`INSERT INTO users (id,email,password_hash,role,full_name,created_at,updated_at)
    VALUES ('11111111-1111-4111-8111-111111111111','legacy-command@example.test','synthetic-unused-hash','admin','Legacy Auth',now(),now());
    INSERT INTO auth_sessions (id,user_id,refresh_token_hash,transport,expires_at,created_at)
    VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','synthetic-retained-refresh-hash','browser',now()+interval '1 day',now());
    INSERT INTO auth_refresh_tokens VALUES (repeat('a',64),'22222222-2222-4222-8222-222222222222',now());
    INSERT INTO auth_rate_limits VALUES (repeat('b',64),3,now()+interval '1 hour');`)
  await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl.toString(), MIGRATION_DATABASE_URL: databaseUrl.toString() } })
  await sql.query('CREATE TABLE fixture_aggregates (id uuid PRIMARY KEY, version bigint NOT NULL CHECK (version > 0), value text NOT NULL)')
})
after(async () => {
  await database.close(); await otherDatabase.close()
  await sql?.end().catch(() => undefined)
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
  await admin.end()
})
async function fixture() {
  const actorId = randomUUID(); const targetId = randomUUID(); const sessionId = randomUUID()
  for (const id of [actorId, targetId]) await database.client.user.create({ data: { id, email: `synthetic-command-${id}@example.test`, passwordHash: 'not-a-usable-password-hash', role: 'Admin', fullName: 'Before', createdAt: new Date(), updatedAt: new Date() } })
  await database.client.authSession.create({ data: { id: sessionId, userId: actorId, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date() } })
  const accessToken = await signAccessToken(actorId, sessionId, new Date(Date.now() + 60_000), auth)
  let runs = 0
  const input: CommandInput = {
    accessToken, method: 'PATCH', canonicalPath: `/api/v1/users/${targetId}`, key: randomUUID(), request: { fullName: 'After' }, requestId: randomUUID(),
    async authorize(transaction) { if (!await transaction.user.findUnique({ where: { id: targetId } })) throw new HttpError(404, 'NOT_FOUND', 'Resource not found.') },
    async execute(transaction) {
      runs++
      await transaction.user.update({ where: { id: targetId }, data: { fullName: 'After' } })
      return outcome(targetId)
    },
  }
  return { actorId, targetId, sessionId, input, runs: () => runs }
}
function outcome(entityId: string): CommandOutcome {
  return { outcome: 'succeeded', response: { status: 200, body: { id: entityId, fullName: 'After' }, headers: { ETag: aggregateEtag('fixture', entityId, 2n) } }, audit: [{ entityType: 'user', entityId, action: 'fixture.changed', before: { fullName: 'Before' }, after: { fullName: 'After' } }] }
}
async function counts(entityId: string) { return { audit: await database.client.auditLog.count({ where: { entityId } }), replay: await database.client.commandReplay.count({ where: { canonicalPath: `/api/v1/users/${entityId}` } }) } }
function gate() { let open!: () => void; const promise = new Promise<void>((resolve) => { open = resolve }); return { open, promise } }

test('command migration preserves populated users, browser sessions, consumed hashes and limiter state', async () => {
  const user = await database.client.user.findUniqueOrThrow({ where: { id: '11111111-1111-4111-8111-111111111111' } })
  const session = await database.client.authSession.findUniqueOrThrow({ where: { id: '22222222-2222-4222-8222-222222222222' } })
  assert.equal(user.fullName, 'Legacy Auth'); assert.equal(user.passwordHash, 'synthetic-unused-hash')
  assert.equal(session.transport, 'browser'); assert.equal(session.refreshTokenHash, 'synthetic-retained-refresh-hash')
  assert.equal(await database.client.authRefreshToken.count({ where: { sessionId: session.id } }), 1)
  assert.equal((await database.client.authRateLimit.findUniqueOrThrow({ where: { keyHash: 'b'.repeat(64) } })).attempts, 3)
  await database.checkReady()
})
test('a new client replays the committed result after response loss without repeating writes or audit', async () => {
  const value = await fixture()
  const first = await executeCommand(value.input)
  const replay = await executeOther({ ...value.input, requestId: randomUUID(), request: { fullName: 'After' }, execute: async () => { throw new Error('A stale precondition must never run on replay.') } })
  assert.equal(first.replayed, false); assert.equal(replay.replayed, true)
  assert.deepEqual(replay.response, first.response)
  assert.equal(value.runs(), 1); assert.deepEqual(await counts(value.targetId), { audit: 1, replay: 1 })
  const saved = await database.client.commandReplay.findFirstOrThrow({ where: { actorUserId: value.actorId } })
  assert.ok(saved.expiresAt.getTime() - saved.createdAt.getTime() >= 24 * 3_600_000)
  assert.ok(!JSON.stringify(saved).includes(value.input.accessToken))
})
test('changed body or original precondition conflicts but object-key order does not', async () => {
  const value = await fixture()
  const input = { ...value.input, request: { a: 1, b: 2 }, ifMatch: '"original"' }
  await executeCommand(input)
  assert.equal((await executeOther({ ...input, request: { b: 2, a: 1 } })).replayed, true)
  await assert.rejects(executeOther({ ...input, request: { a: 2, b: 2 } }), { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' })
  await assert.rejects(executeOther({ ...input, ifMatch: '"new"' }), { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' })
})
test('in-flight duplicate returns retry guidance and subsequently receives the stored result', { timeout: 10_000 }, async () => {
  const value = await fixture(); const entered = gate(); const release = gate()
  const pending = executeCommand({ ...value.input, execute: async (transaction, actor) => { entered.open(); await release.promise; return value.input.execute(transaction, actor) } })
  try {
    await entered.promise
    await assert.rejects(executeOther(value.input), { status: 409, code: 'COMMAND_IN_PROGRESS', retryAfterSeconds: 1 })
  } finally { release.open() }
  await pending
  assert.equal((await executeOther(value.input)).replayed, true)
  assert.equal(value.runs(), 1)
})
test('actor, method and canonical path isolate otherwise identical keys', async () => {
  const first = await fixture(); const second = await fixture()
  await executeCommand(first.input); await executeOther({ ...first.input, accessToken: second.input.accessToken })
  await executeCommand({ ...first.input, canonicalPath: `/api/v1/users/${first.targetId}/status` })
  await executeCommand({ ...first.input, method: 'POST' })
  assert.equal(await database.client.commandReplay.count({ where: { idempotencyKey: first.input.key } }), 4)
  assert.equal(await database.client.auditLog.count({ where: { entityId: first.targetId } }), 4)
})
test('current resource authorization and disabled/revoked/expired credentials deny stored replay', async () => {
  const value = await fixture(); await executeCommand(value.input)
  await assert.rejects(executeOther({ ...value.input, authorize: async () => { throw new HttpError(404, 'NOT_FOUND', 'Resource not found.') } }), { status: 404 })
  await database.client.user.update({ where: { id: value.actorId }, data: { isActive: false } })
  await assert.rejects(executeOther(value.input), { status: 401 })
  await database.client.user.update({ where: { id: value.actorId }, data: { isActive: true } })
  await database.client.authSession.update({ where: { id: value.sessionId }, data: { revokedAt: new Date() } })
  await assert.rejects(executeOther(value.input), { status: 401 })
  const expired = await signAccessToken(value.actorId, value.sessionId, new Date(0), auth)
  await assert.rejects(executeOther({ ...value.input, accessToken: expired }), { status: 401 })
  assert.deepEqual(await counts(value.targetId), { audit: 1, replay: 1 })
})
test('a failed workflow rolls back its write and releases its command identity for retry', async () => {
  const value = await fixture()
  await assert.rejects(executeCommand({ ...value.input, execute: async (transaction) => { await transaction.user.update({ where: { id: value.targetId }, data: { fullName: 'Must roll back' } }); throw new Error('Synthetic failure after write') } }), /Synthetic failure/)
  assert.equal((await database.client.user.findUniqueOrThrow({ where: { id: value.targetId } })).fullName, 'Before')
  assert.deepEqual(await counts(value.targetId), { audit: 0, replay: 0 })
  assert.equal((await executeOther(value.input)).replayed, false)
})
test('audit and business writes roll back together if replay persistence fails', async () => {
  const value = await fixture()
  await sql.query("CREATE FUNCTION fixture_fail_replay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic replay persistence failure' USING ERRCODE='23514'; END; $$; CREATE TRIGGER fixture_replay_failure BEFORE INSERT ON command_replays FOR EACH ROW EXECUTE FUNCTION fixture_fail_replay();")
  try { await assert.rejects(executeCommand(value.input)) }
  finally { await sql.query('DROP TRIGGER fixture_replay_failure ON command_replays; DROP FUNCTION fixture_fail_replay()') }
  assert.equal((await database.client.user.findUniqueOrThrow({ where: { id: value.targetId } })).fullName, 'Before')
  assert.deepEqual(await counts(value.targetId), { audit: 0, replay: 0 })
  await executeOther(value.input)
})
test('sensitive response or audit data aborts the whole workflow instead of being persisted', async () => {
  const value = await fixture()
  await assert.rejects(executeCommand({ ...value.input, execute: async (transaction, actor) => { const result = await value.input.execute(transaction, actor); result.audit[0]!.after = { password: 'synthetic-private' }; return result } }), /Sensitive fields/)
  assert.deepEqual(await counts(value.targetId), { audit: 0, replay: 0 })
  assert.equal((await database.client.user.findUniqueOrThrow({ where: { id: value.targetId } })).fullName, 'Before')
})
test('an explicit safe denial persists its audit once and replays without another attempt', async () => {
  const value = await fixture(); let attempts = 0
  const input = { ...value.input, execute: async (): Promise<CommandOutcome> => { attempts++; return { outcome: 'rejected', response: { status: 422, body: { error: { code: 'SYNTHETIC_DENIAL', message: 'Denied.' } } }, audit: [{ entityType: 'user', entityId: value.targetId, action: 'fixture.denied' }] } } }
  assert.equal((await executeCommand(input)).response.status, 422)
  assert.equal((await executeOther(input)).replayed, true)
  assert.equal(attempts, 1); assert.deepEqual(await counts(value.targetId), { audit: 1, replay: 1 })
})
test('expired replay keys can be reused without removing prior audit history', async () => {
  const value = await fixture(); await executeCommand(value.input)
  await database.client.commandReplay.updateMany({ where: { actorUserId: value.actorId }, data: { createdAt: new Date(Date.now() - 48 * 3_600_000), expiresAt: new Date(Date.now() - 1000) } })
  assert.equal((await executeOther({ ...value.input, request: { fullName: 'New intent' } })).replayed, false)
  assert.equal(value.runs(), 2); assert.deepEqual(await counts(value.targetId), { audit: 2, replay: 1 })
})
test('audit history rejects update, delete, truncate and actor deletion', async () => {
  const value = await fixture(); await executeCommand(value.input)
  await assert.rejects(sql.query('UPDATE audit_logs SET action=$1 WHERE entity_id=$2', ['changed', value.targetId]), { code: '23514' })
  await assert.rejects(sql.query('DELETE FROM audit_logs WHERE entity_id=$1', [value.targetId]), { code: '23514' })
  await assert.rejects(sql.query('TRUNCATE audit_logs'), { code: '23514' })
  // Remove unrelated references to prove the audit FK itself preserves the actor.
  await database.client.commandReplay.deleteMany({ where: { actorUserId: value.actorId } })
  await database.client.authSession.deleteMany({ where: { userId: value.actorId } })
  await assert.rejects(database.client.user.delete({ where: { id: value.actorId } }), { code: 'P2003' })
  assert.equal(await database.client.auditLog.count({ where: { entityId: value.targetId } }), 1)
})
test('concurrent new intents sharing a version yield one update, while its original key replays', async () => {
  const value = await fixture(); const id = randomUUID(); const originalTag = aggregateEtag('fixture', id, 1n)
  await sql.query('INSERT INTO fixture_aggregates VALUES ($1,1,$2)', [id, 'Before'])
  const input: CommandInput = { ...value.input, canonicalPath: `/api/v1/fixture-aggregates/${id}`, ifMatch: originalTag,
    async execute(transaction) {
      const rows = await transaction.$queryRaw<{ version: bigint }[]>`SELECT version FROM fixture_aggregates WHERE id=${id}::uuid FOR UPDATE`
      requireAggregateMatch(originalTag, aggregateEtag('fixture', id, rows[0]!.version))
      const version = nextAggregateVersion(rows[0]!.version)
      await transaction.$executeRaw`UPDATE fixture_aggregates SET version=${version}, value='After' WHERE id=${id}::uuid`
      return { ...outcome(id), response: { status: 200, body: { id }, headers: { ETag: aggregateEtag('fixture', id, version) } } }
    },
  }
  const competing = { ...input, key: randomUUID() }
  const results = await Promise.allSettled([executeCommand(input), executeOther(competing)])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult
  assert.equal(rejected.reason.status, 412)
  const winner = results[0]!.status === 'fulfilled' ? input : competing
  assert.equal((await executeOther(winner)).replayed, true)
  assert.equal((await sql.query('SELECT version FROM fixture_aggregates WHERE id=$1', [id])).rows[0].version, '2')
  assert.equal(await database.client.auditLog.count({ where: { entityId: id } }), 1)
})
test('known rolled-back conflicts retry the whole transaction with no partial audit', async () => {
  const value = await fixture(); let attempts = 0
  await executeCommand({ ...value.input, execute: async (transaction, actor) => { const result = await value.input.execute(transaction, actor); attempts++; if (attempts < 3) throw Object.assign(new Error('Synthetic rolled-back conflict'), { code: 'P2034' }); return result } })
  assert.equal(attempts, 3); assert.deepEqual(await counts(value.targetId), { audit: 1, replay: 1 })
  const exhausted = await fixture(); let failedAttempts = 0
  await assert.rejects(executeCommand({ ...exhausted.input, execute: async () => { failedAttempts++; throw Object.assign(new Error('Synthetic conflict'), { code: 'P2034' }) } }), { status: 503, code: 'COMMAND_RETRY_REQUIRED' })
  assert.equal(failedAttempts, 3); assert.deepEqual(await counts(exhausted.targetId), { audit: 0, replay: 0 })
})
test('losing the workflow connection rolls back its write and leaves no stuck pending command', { timeout: 10_000 }, async () => {
  const value = await fixture(); const entered = gate(); const release = gate(); let pid = 0
  const pending = executeCommand({ ...value.input, execute: async (transaction, actor) => {
    await transaction.user.update({ where: { id: value.targetId }, data: { fullName: 'Uncommitted' } })
    pid = (await transaction.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]!.pid
    entered.open(); await release.promise
    return value.input.execute(transaction, actor)
  } })
  const rejected = assert.rejects(pending)
  try { await entered.promise; await sql.query('SELECT pg_terminate_backend($1)', [pid]) } finally { release.open() }
  await rejected
  assert.equal((await otherDatabase.client.user.findUniqueOrThrow({ where: { id: value.targetId } })).fullName, 'Before')
  assert.deepEqual(await counts(value.targetId), { audit: 0, replay: 0 })
  await executeOther(value.input)
  assert.deepEqual(await counts(value.targetId), { audit: 1, replay: 1 })
})
