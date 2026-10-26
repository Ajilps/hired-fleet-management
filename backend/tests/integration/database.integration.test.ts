import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import request from 'supertest'
import { createDatabase } from '../../src/database/database-client.ts'
import { readEnvironment } from '../../src/config/environment.ts'
import { createApp } from '../../src/app.ts'
import type { Prisma } from '../../src/generated/prisma/client.ts'

// Fail rather than silently skipping integration or falling back to a developer DB.
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must identify a disposable migrated database.')
const config = readEnvironment({ NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL })
const database = createDatabase(config)
after(async () => { await database.close() })

async function withRollback(check: (transaction: Prisma.TransactionClient) => Promise<void>) {
  const rollback = new Error('rollback synthetic fixture')
  await assert.rejects(database.client.$transaction(async (transaction) => {
    await check(transaction)
    throw rollback
  }), (error: unknown) => error === rollback)
}

function userFixture() {
  const id = randomUUID()
  return { id, email: `synthetic-${id}@example.test`, passwordHash: 'not-a-usable-password-hash', role: 'Admin' as const, fullName: 'Synthetic Admin', createdAt: new Date(), updatedAt: new Date() }
}

test('migrated PostgreSQL passes HTTP readiness and preserves native identity fields', async () => {
  await request(createApp(config, database)).get('/ready').expect(200)
  await withRollback(async (transaction) => {
    const fixture = userFixture()
    const user = await transaction.user.create({ data: fixture })
    assert.equal(user.isActive, true)
    assert.equal(user.createdAt.toISOString(), fixture.createdAt.toISOString())
    const session = await transaction.authSession.create({ data: {
      id: randomUUID(), userId: user.id, refreshTokenHash: randomUUID(), ipAddress: '2001:db8::1',
      expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(),
    } })
    assert.equal(session.ipAddress, '2001:db8::1')
    assert.equal(session.revokedAt, null)
    const rows = await transaction.$queryRaw<{ role: string }[]>`SELECT role::text FROM users WHERE id = ${user.id}::uuid`
    assert.equal(rows[0]?.role, 'admin')
  })
})

test('database rejects duplicate email, duplicate refresh hash and orphan sessions', async () => {
  await withRollback(async (transaction) => {
    const fixture = userFixture()
    await transaction.user.create({ data: fixture })
    await assert.rejects(transaction.user.create({ data: { ...fixture, id: randomUUID() } }), { code: 'P2002' })
  })
  await withRollback(async (transaction) => {
    const user = await transaction.user.create({ data: userFixture() })
    const session = { id: randomUUID(), userId: user.id, refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000), createdAt: new Date() }
    await transaction.authSession.create({ data: session })
    await assert.rejects(transaction.authSession.create({ data: { ...session, id: randomUUID() } }), { code: 'P2002' })
  })
  await withRollback(async (transaction) => {
    await assert.rejects(transaction.authSession.create({ data: {
      id: randomUUID(), userId: randomUUID(), refreshTokenHash: randomUUID(), expiresAt: new Date(), createdAt: new Date(),
    } }), { code: 'P2003' })
  })
})

test('migration installs mapped constraints, session index and timestamp types', async () => {
  const constraints = await database.client.$queryRaw<{ conname: string }[]>`
    SELECT conname FROM pg_constraint WHERE conrelid IN ('users'::regclass, 'auth_sessions'::regclass)`
  const names = constraints.map((row) => row.conname)
  for (const name of ['pk_users', 'pk_auth_sessions', 'fk_auth_sessions_user_id']) assert.ok(names.includes(name))
  const indexes = await database.client.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('users', 'auth_sessions')`
  for (const name of ['uq_users_email', 'uq_auth_sessions_refresh_token_hash', 'ix_auth_sessions_user_id_expires_at']) {
    assert.ok(indexes.some((row) => row.indexname === name))
  }
  const columns = await database.client.$queryRaw<{ data_type: string }[]>`
    SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'auth_sessions' AND column_name = 'expires_at'`
  assert.equal(columns[0]?.data_type, 'timestamp with time zone')
})
