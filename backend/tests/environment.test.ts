import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readEnvironment } from '../src/config/environment.ts'

const databaseUrl = 'postgresql://synthetic:private-test-value@localhost:5432/hired_test'

test('validates database configuration without leaking supplied secrets', () => {
  assert.throws(() => readEnvironment({ DATABASE_URL: 'private-test-value' }), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /DATABASE_URL/)
    assert.ok(!error.message.includes('private-test-value'))
    return true
  })
  for (const source of [
    {}, { DATABASE_URL: 'https://example.test/db' }, { DATABASE_URL: databaseUrl, PORT: '0' },
    { DATABASE_URL: databaseUrl, PORT: '65536' }, { DATABASE_URL: databaseUrl, DATABASE_POOL_MAX: 'Infinity' },
    { DATABASE_URL: databaseUrl, DATABASE_QUERY_TIMEOUT_MS: '' },
    { DATABASE_URL: `${databaseUrl}?schema=other` },
  ]) assert.throws(() => readEnvironment(source))
})

test('accepts explicit settings and only complete browser origins', () => {
  const config = readEnvironment({ DATABASE_URL: databaseUrl, PORT: '3100', DATABASE_POOL_MAX: '4', CORS_ORIGINS: 'http://localhost:5173, https://portal.example.test' })
  assert.equal(config.port, 3100)
  assert.equal(config.databasePoolMax, 4)
  assert.deepEqual(config.corsOrigins, ['http://localhost:5173', 'https://portal.example.test'])
  for (const origin of ['*', 'null', 'https://portal.example.test/path', 'https://user:password@portal.example.test', 'file:///tmp']) {
    assert.throws(() => readEnvironment({ DATABASE_URL: databaseUrl, CORS_ORIGINS: origin }))
  }
  assert.deepEqual(readEnvironment({ DATABASE_URL: databaseUrl }).corsOrigins, [])
})
