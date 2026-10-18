import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { ServerResponse } from 'node:http'
import { test } from 'node:test'
import request from 'supertest'
import { createApp } from '../src/app.ts'
import { createFileRouter } from '../src/modules/files/index.ts'
import { fileAssetDto } from '../src/modules/files/file-mapper.ts'
import { readStorageConfig } from '../src/modules/files/storage-config.ts'
import { createPrivateObjectStore } from '../src/modules/files/private-object-store.ts'
import type { PrismaClient } from '../src/generated/prisma/client.ts'
import { readAuthConfig } from '../src/modules/auth/index.ts'

const example = { NODE_ENV: 'test', STORAGE_ENDPOINT: 'http://127.0.0.1:8333', STORAGE_REGION: 'us-east-1', STORAGE_BUCKET: 'synthetic-private', STORAGE_ACCESS_KEY_ID: 'synthetic-access', STORAGE_SECRET_ACCESS_KEY: 'synthetic-secret' }
const bytes = Buffer.from('synthetic object bytes'); const checksum = createHash('sha256').update(bytes).digest('hex')

test('storage configuration requires explicit credentials and secure or local-only origins without leaking values', () => {
  assert.equal(readStorageConfig(example).forcePathStyle, true)
  assert.equal(readStorageConfig({ ...example, STORAGE_FORCE_PATH_STYLE: 'false' }).forcePathStyle, false)
  for (const extra of [{ STORAGE_ENDPOINT: 'invalid' }, { STORAGE_ENDPOINT: 'http://public.example.test' }, { STORAGE_ENDPOINT: 'https://user:secret@example.test' }, { STORAGE_ENDPOINT: 'https://example.test/?secret=value' }, { STORAGE_ENDPOINT: 'https://example.test/path' }, { STORAGE_ENDPOINT: 'https://example.test/#secret' }, { NODE_ENV: 'production' }, { STORAGE_ACCESS_KEY_ID: '' }, { STORAGE_SECRET_ACCESS_KEY: '' }, { STORAGE_TIMEOUT_MS: '0' }, { STORAGE_TIMEOUT_MS: '10001' }, { STORAGE_FORCE_PATH_STYLE: 'yes' }]) {
    assert.throws(() => readStorageConfig({ ...example, ...extra }), { message: 'Invalid private storage configuration. See backend/.env.example.' })
  }
  assert.equal(readStorageConfig({ ...example, NODE_ENV: 'production', STORAGE_ENDPOINT: 'https://s3.example.test' }).endpoint, 'https://s3.example.test')
})
test('metadata DTO explicitly excludes storage keys and internal context', () => {
  const id = randomUUID(); const uploadedByUserId = randomUUID(); const createdAt = new Date()
  const dto = fileAssetDto({ id, uploadedByUserId, createdAt, storageKey: `quarantine/${id}`, originalFilename: 'synthetic.pdf', mimeType: 'application/pdf', byteSize: 123n, checksumSha256: checksum, malwareScanStatus: 'pending', purpose: 'driver_document', driverId: randomUUID() })
  assert.deepEqual(Object.keys(dto).sort(), ['id','originalFilename','mimeType','sizeBytes','checksumSha256','scanStatus','uploadedByUserId','createdAt'].sort())
  assert.equal(dto.sizeBytes, 123); assert.equal(dto.scanStatus, 'pending'); assert.equal(JSON.stringify(dto).includes('quarantine/'), false)
})
test('file HTTP route rejects missing credentials and malformed IDs without touching persistence', async () => {
  const auth = readAuthConfig({ AUTH_SESSION_KEY: Buffer.alloc(32, 1).toString('base64url') })
  const app = createApp({ corsOrigins: [] }, { async checkReady() {} }, () => false, createFileRouter({} as PrismaClient, auth))
  await request(app).get(`/api/v1/file-assets/${randomUUID()}`).expect(401)
  await request(app).get('/api/v1/file-assets/not-a-uuid').set('Authorization', 'Bearer synthetic').expect(422)
  // Uploads remain opt-in; signed downloads are not implemented in this increment.
  await request(app).post('/api/v1/file-assets').send({}).expect(404)
  await request(app).post(`/api/v1/file-assets/${randomUUID()}/download-links`).send({}).expect(404)
})
async function withStorage(handler: (response: ServerResponse) => void, run: (store: ReturnType<typeof createPrivateObjectStore>) => Promise<void>, timeoutMs = 1000) {
  const server = createServer((_request, response) => { response.setHeader('Connection', 'close'); handler(response) })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test listener.')
  const store = createPrivateObjectStore(readStorageConfig({ ...example, STORAGE_ENDPOINT: `http://127.0.0.1:${address.port}`, STORAGE_TIMEOUT_MS: String(timeoutMs) }))
  try { await run(store) } finally { store.close(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
}
test('bounded object reads reject excessive, corrupt and stalled responses with sanitized errors', async () => {
  const id = randomUUID()
  const unavailable = { status: 503, code: 'STORAGE_UNAVAILABLE', message: 'Private storage could not complete the operation.' }
  await withStorage((response) => response.end(bytes), async (store) => { assert.deepEqual(await store.read(id, bytes.length, checksum), bytes) })
  await withStorage((response) => response.end(bytes), async (store) => { await assert.rejects(store.read(id, bytes.length - 1, checksum), unavailable); await assert.rejects(store.read(id, bytes.length, '0'.repeat(64)), unavailable) })
  await withStorage((response) => { response.writeHead(200, { 'Transfer-Encoding': 'chunked' }); response.write(bytes); response.end(bytes) }, async (store) => { await assert.rejects(store.read(id, bytes.length, checksum), unavailable) })
  await withStorage((response) => { response.writeHead(200); response.write(bytes.subarray(0, 1)) }, async (store) => { await assert.rejects(store.read(id, bytes.length, checksum), unavailable) }, 100)
  await withStorage((response) => { response.statusCode = 403; response.end('<Error><Code>AccessDenied</Code><Message>synthetic-secret quarantine/private</Message></Error>') }, async (store) => {
    await assert.rejects(store.read(id, bytes.length, checksum), unavailable)
    await assert.rejects(store.put(id, bytes, bytes.length), unavailable)
    await assert.rejects(store.remove(id), unavailable)
  })
})
test('object adapter refuses caller paths, unbounded sizes and empty bytes before making requests', async () => {
  const store = createPrivateObjectStore(readStorageConfig(example)); const id = randomUUID()
  try {
    await assert.rejects(store.put('../foreign', bytes, 100), /canonical file asset UUID/)
    await assert.rejects(store.put(id, bytes, Number.POSITIVE_INFINITY), /positive safe byte bound/)
    await assert.rejects(store.put(id, new Uint8Array(), 100), { status: 413 })
    await assert.rejects(store.put(id, bytes, 1), { status: 413 })
    await assert.rejects(store.read(id, 0, checksum), /positive safe byte bound/)
    await assert.rejects(store.read(id, 100, 'invalid'), /canonical SHA-256/)
  } finally { store.close() }
})
