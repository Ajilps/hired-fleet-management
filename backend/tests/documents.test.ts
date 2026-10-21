import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { attachDocumentSchema, listDocumentsSchema } from '../src/modules/documents/document-validator.ts'
import { readDocumentCipher } from '../src/modules/documents/document-crypto.ts'
import { createDocumentCursor } from '../src/modules/documents/document-cursor.ts'
import { createPrivateObjectStore, readStorageConfig } from '../src/modules/files/index.ts'

const context = { id: randomUUID(), driverId: randomUUID(), fileAssetId: randomUUID(), documentType: 'pan' }
const raw = 'SYNTHETIC-NUMBER-ABCD1234'
const key = randomBytes(32).toString('base64url')
test('document numbers round-trip under authenticated encryption and reject tampering/context/key swaps', () => {
  const cipher = readDocumentCipher({ DOCUMENT_NUMBER_ENCRYPTION_KEY: key })!
  const first = cipher.encrypt(raw, context); const second = cipher.encrypt(raw, context)
  assert.notEqual(first.documentNumberCiphertext, second.documentNumberCiphertext)
  assert.equal(first.maskedDocumentNumber, '****1234')
  assert.equal(first.documentNumberCiphertext.includes(raw), false)
  assert.equal(cipher.decrypt(first.documentNumberCiphertext, first.documentNumberKeyId, context), raw)
  for (const changed of [{ ...context, id: randomUUID() }, { ...context, driverId: randomUUID() }, { ...context, fileAssetId: randomUUID() }, { ...context, documentType: 'pcc' }]) assert.throws(() => cipher.decrypt(first.documentNumberCiphertext, first.documentNumberKeyId, changed), { code: 'DOCUMENT_KEY_UNAVAILABLE' })
  const pieces = first.documentNumberCiphertext.split('.')
  pieces[1] = `${pieces[1]![0] === 'A' ? 'B' : 'A'}${pieces[1]!.slice(1)}`
  assert.throws(() => cipher.decrypt(pieces.join('.'), first.documentNumberKeyId, context), { code: 'DOCUMENT_KEY_UNAVAILABLE' })
  assert.throws(() => cipher.decrypt(first.documentNumberCiphertext, 'missing', context), { code: 'DOCUMENT_KEY_UNAVAILABLE' })
  const rotated = readDocumentCipher({ DOCUMENT_NUMBER_KEY_ID: 'next-v2', DOCUMENT_NUMBER_ENCRYPTION_KEY: randomBytes(32).toString('base64url'), DOCUMENT_NUMBER_PREVIOUS_KEYS: JSON.stringify({ 'local-v1': key }) })!
  assert.equal(rotated.decrypt(first.documentNumberCiphertext, first.documentNumberKeyId, context), raw)
  assert.equal(cipher.encrypt('1234', context).maskedDocumentNumber, '****')
})
test('document key configuration is optional but malformed or reused secrets fail without disclosure', () => {
  assert.equal(readDocumentCipher({}), undefined)
  for (const extra of [{ DOCUMENT_NUMBER_ENCRYPTION_KEY: 'invalid-secret' }, { DOCUMENT_NUMBER_KEY_ID: 'bad.key' }, { AUTH_SESSION_KEY: key }, { COMMAND_FINGERPRINT_KEY: key }, { DOCUMENT_NUMBER_PREVIOUS_KEYS: 'secret-invalid-json' }, { DOCUMENT_NUMBER_PREVIOUS_KEYS: JSON.stringify({ 'local-v1': randomBytes(32).toString('base64url') }) }]) {
    assert.throws(() => readDocumentCipher({ DOCUMENT_NUMBER_ENCRYPTION_KEY: key, ...extra }), { message: 'Invalid document encryption configuration.' })
  }
})
test('attachment validation rejects injected scope/state, invalid numbers/dates and unknown fields', () => {
  const input = { documentType: 'pan', fileAssetId: randomUUID(), documentNumber: raw, expiresOn: '2030-02-28' }
  assert.ok(attachDocumentSchema.safeParse(input).success)
  for (const extra of [{ driverId: randomUUID() }, { isCurrent: true }, { scanStatus: 'clean' }, { documentType: 'unknown' }, { documentNumber: '\0secret' }, { documentNumber: '' }, { expiresOn: '2030-02-30' }]) assert.equal(attachDocumentSchema.safeParse({ ...input, ...extra }).success, false)
  assert.equal(listDocumentsSchema.parse({ isCurrent: 'false' }).isCurrent, false)
  for (const query of [{ isCurrent: 'yes' }, { limit: 101 }, { cursor: '' }, { search: 'unimplemented' }]) assert.equal(listDocumentsSchema.safeParse(query).success, false)
})
test('document cursors preserve microseconds and reject swapped actor/driver/filter scopes', () => {
  const cursor = createDocumentCursor(randomBytes(32)); const position = { id: randomUUID(), uploadedAt: '2026-10-18T01:02:03.123456Z' }
  const value = cursor.encode('own-a:true', position)
  assert.deepEqual(cursor.decode('own-a:true', value), position)
  for (const scope of ['own-b:true', 'own-a:false', 'admin-a:true']) assert.throws(() => cursor.decode(scope, value), { status: 422 })
  assert.throws(() => cursor.decode('own-a:true', `${value}x`), { status: 422 })
})
test('signed downloads preserve browser origin, five-minute expiry and safe response overrides', async () => {
  const config = readStorageConfig({ NODE_ENV: 'test', STORAGE_ENDPOINT: 'http://seaweedfs:8333', STORAGE_PUBLIC_ENDPOINT: 'http://localhost:8333', STORAGE_REGION: 'us-east-1', STORAGE_BUCKET: 'synthetic-private', STORAGE_ACCESS_KEY_ID: 'synthetic-access', STORAGE_SECRET_ACCESS_KEY: 'synthetic-secret' })
  const store = createPrivateObjectStore(config); const now = new Date('2026-10-18T01:02:03Z')
  try {
    const result = await store.signDownload(context.fileAssetId, 'application/pdf', now); const url = new URL(result.url)
    assert.equal(url.origin, 'http://localhost:8333'); assert.equal(url.searchParams.get('X-Amz-Expires'), '300')
    assert.equal(url.searchParams.get('response-content-type'), 'application/pdf'); assert.equal(url.searchParams.get('response-cache-control'), 'no-store')
    assert.equal(result.expiresAt, '2026-10-18T01:07:03.000Z')
    await assert.rejects(store.signDownload('../escape', 'application/pdf'))
    await assert.rejects(store.signDownload(context.id, 'text/html'))
  } finally { store.close() }
  for (const endpoint of ['http://public.example.test', 'https://user:secret@example.test', 'https://public.example.test/path']) assert.throws(() => readStorageConfig({ NODE_ENV: 'test', STORAGE_ENDPOINT: 'http://seaweedfs:8333', STORAGE_PUBLIC_ENDPOINT: endpoint, STORAGE_REGION: 'us-east-1', STORAGE_BUCKET: 'synthetic-private', STORAGE_ACCESS_KEY_ID: 'synthetic-access', STORAGE_SECRET_ACCESS_KEY: 'synthetic-secret' }), /Invalid private storage/)
})
