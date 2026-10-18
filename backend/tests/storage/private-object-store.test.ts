import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createPrivateObjectStore, readStorageConfig } from '../../src/modules/files/index.ts'

// Explicit opt-in and loopback prevent an inherited developer/production storage
// configuration from turning an integration test into a real-data operation.
if (!process.env.TEST_STORAGE_ENDPOINT) throw new Error('TEST_STORAGE_ENDPOINT must explicitly identify disposable loopback SeaweedFS.')
const endpoint = new URL(process.env.TEST_STORAGE_ENDPOINT)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) throw new Error('Storage integration requires a loopback endpoint.')
const config = readStorageConfig({ ...process.env, NODE_ENV: 'test', STORAGE_ENDPOINT: endpoint.origin })

test('real SeaweedFS SDK operations preserve private, immutable bytes and verify integrity', async () => {
  const store = createPrivateObjectStore(config); const id = randomUUID()
  const bytes = Buffer.from('Synthetic private-file integration fixture. No personal data.')
  try {
    const saved = await store.put(id, bytes, 1024)
    assert.deepEqual(await store.read(id, 1024, saved.checksumSha256), bytes)
    await assert.rejects(store.put(id, Buffer.from('replacement must fail'), 1024), { status: 409, code: 'STORAGE_OBJECT_EXISTS' })
    assert.deepEqual(await store.read(id, 1024, saved.checksumSha256), bytes)
    await assert.rejects(store.read(id, bytes.length - 1, saved.checksumSha256), { status: 503 })
    await assert.rejects(store.read(id, 1024, '0'.repeat(64)), { status: 503 })
    const objectUrl = new URL(`/${config.bucket}/${saved.storageKey}`, config.endpoint)
    assert.equal((await fetch(objectUrl)).status, 403)
    const denied = createPrivateObjectStore({ ...config, secretAccessKey: 'synthetic-invalid-credential' })
    try { await assert.rejects(denied.read(id, 1024, saved.checksumSha256), { status: 503, code: 'STORAGE_UNAVAILABLE' }) }
    finally { denied.close() }
    await store.remove(id); await store.remove(id)
    await assert.rejects(store.read(id, 1024, saved.checksumSha256), { status: 503 })
  } finally { try { await store.remove(id) } finally { store.close() } }
})
