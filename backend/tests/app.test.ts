import assert from 'node:assert/strict'
import { test } from 'node:test'
import request from 'supertest'
import { createApp } from '../src/app.ts'

const config = { corsOrigins: ['http://localhost:5173'] }
const healthyDatabase = { async checkReady() {} }

test('liveness stays available while readiness fails safely on database failure', async () => {
  const app = createApp(config, { async checkReady() { throw new Error('postgresql://private:secret@db/internal') } })
  const health = await request(app).get('/health').expect(200)
  assert.deepEqual(health.body, { status: 'ok' })
  const ready = await request(app).get('/ready').expect(503)
  assert.equal(ready.body.error.code, 'SERVICE_UNAVAILABLE')
  assert.equal(ready.body.error.requestId, ready.headers['x-request-id'])
  assert.equal(ready.headers['cache-control'], 'no-store')
  assert.ok(!ready.text.includes('secret'))
})

test('readiness succeeds after database recovery and refuses traffic during shutdown', async () => {
  let hasFailed = true
  const app = createApp(config, { async checkReady() { if (hasFailed) throw new Error('offline') } })
  await request(app).get('/ready').expect(503)
  hasFailed = false
  await request(app).get('/ready').expect(200, { status: 'ready' })
  const shuttingDownApp = createApp(config, { async checkReady() { assert.fail('Must not probe during shutdown') } }, () => true)
  await request(shuttingDownApp).get('/ready').expect(503)
})

test('CORS permits configured origins and command headers without allowing other origins', async () => {
  const app = createApp(config, healthyDatabase)
  const allowed = await request(app).options('/api/v1/orders').set('Origin', config.corsOrigins[0]!)
    .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization,idempotency-key,if-match').expect(204)
  assert.equal(allowed.headers['access-control-allow-origin'], config.corsOrigins[0])
  assert.match(allowed.headers['access-control-allow-headers'] ?? '', /Idempotency-Key/)
  assert.equal(allowed.headers['access-control-allow-credentials'], 'true')
  const denied = await request(app).get('/health').set('Origin', 'https://untrusted.example.test').expect(200)
  assert.equal(denied.headers['access-control-allow-origin'], undefined)
})

test('returns contract errors for unknown routes, malformed JSON and oversized bodies', async () => {
  const app = createApp(config, healthyDatabase)
  const missing = await request(app).get('/api/v1/users/me').set('X-Request-Id', 'untrusted').expect(404)
  assert.equal(missing.body.error.code, 'NOT_FOUND')
  assert.match(missing.headers['x-request-id'] ?? '', /^[0-9a-f-]{36}$/)
  assert.equal(missing.headers['x-powered-by'], undefined)
  assert.equal(missing.headers['x-content-type-options'], 'nosniff')
  const malformed = await request(app).post('/api/v1/unknown').set('Content-Type', 'application/json').send('{').expect(400)
  assert.equal(malformed.body.error.code, 'VALIDATION_FAILED')
  const oversized = await request(app).post('/api/v1/unknown').send({ value: 'x'.repeat(70_000) }).expect(413)
  assert.equal(oversized.body.error.code, 'PAYLOAD_TOO_LARGE')
})
