import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('automatic local setup refuses production, missing opt-in and missing credentials', () => {
  for (const environment of [
    { NODE_ENV: 'production', LOCAL_COMPOSE_STARTUP: 'true' },
    { NODE_ENV: 'development', LOCAL_COMPOSE_STARTUP: 'false' },
    { NODE_ENV: 'development', LOCAL_COMPOSE_STARTUP: 'true', LOCAL_ADMIN_PASSWORD: '' },
  ]) {
    const result = spawnSync(process.execPath, ['scripts/start-local.mjs'], {
      env: { ...process.env, ...environment }, encoding: 'utf8', timeout: 5000,
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /only available through local development Compose|Set LOCAL_ADMIN_PASSWORD/)
  }
})
