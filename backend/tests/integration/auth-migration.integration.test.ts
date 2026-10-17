import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

test('auth migration upgrades a populated foundation without replacing users or sessions', async () => {
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must identify a disposable PostgreSQL test service with CREATE DATABASE permission.')
  const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL })
  const databaseName = `hired_auth_upgrade_${randomBytes(6).toString('hex')}`
  const url = new URL(process.env.TEST_DATABASE_URL)
  url.pathname = `/${databaseName}`
  const client = new Client({ connectionString: url.toString() })
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const run = promisify(execFile)
  const environment = { ...process.env, DATABASE_URL: url.toString(), MIGRATION_DATABASE_URL: url.toString() }
  await admin.connect()
  try {
    // The identifier is a fixed prefix plus generated hex, never caller input.
    await admin.query(`CREATE DATABASE "${databaseName}"`)
    await client.connect()
    await client.query(await readFile(new URL('../../prisma/migrations/20261017120952_create_identity_tables/migration.sql', import.meta.url), 'utf8'))
    await client.query(`INSERT INTO users (id,email,password_hash,role,full_name,created_at,updated_at)
      VALUES ('11111111-1111-4111-8111-111111111111','Legacy@EXAMPLE.TEST','synthetic-unused-hash','admin','Legacy Fixture',now(),now());
      INSERT INTO auth_sessions (id,user_id,refresh_token_hash,expires_at,created_at)
      VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','synthetic-unused-refresh-hash',now()+interval '1 day',now());`)
    await run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'resolve', '--applied', '20261017120952_create_identity_tables'], { cwd: root, env: environment })
    await run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { cwd: root, env: environment })
    const result = await client.query('SELECT users.id, users.email, auth_sessions.transport FROM users JOIN auth_sessions ON auth_sessions.user_id=users.id')
    assert.deepEqual(result.rows, [{ id: '11111111-1111-4111-8111-111111111111', email: 'legacy@example.test', transport: 'token' }])
    await assert.rejects(client.query("UPDATE users SET email='UPPER@example.test'"), { code: '23514' })
  } finally {
    await client.end().catch(() => undefined)
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
    await admin.end()
  }
})
