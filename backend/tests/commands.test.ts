import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '../src/generated/prisma/client.ts'
import { readAuthConfig } from '../src/modules/auth/index.ts'
import { createCommandExecutor, aggregateEtag, requireAggregateMatch, nextAggregateVersion } from '../src/modules/commands/index.ts'
import { canonicalJson, fingerprintRequest, validateCommand, validateOutcome } from '../src/modules/commands/command-validation.ts'
import type { CommandInput } from '../src/modules/commands/index.ts'
import { withWorkflowTransaction, assertWorkflowTransaction } from '../src/shared/database/workflow-transaction.ts'
import type { WorkflowTransaction } from '../src/shared/database/workflow-transaction.ts'

const id = '11111111-1111-4111-8111-111111111111'
test('canonical fingerprints preserve intent while ignoring JSON object key order', () => {
  const key = randomBytes(32)
  const fingerprint = (input: unknown) => fingerprintRequest(canonicalJson(input), key)
  assert.equal(fingerprint({ b: [2, 1], a: 'private input' }), fingerprint({ a: 'private input', b: [2, 1] }))
  assert.notEqual(fingerprint([1, 2]), fingerprint([2, 1]))
  assert.notEqual(fingerprintRequest('private input', key), fingerprintRequest('private input', randomBytes(32)))
  assert.match(fingerprint('private input'), /^[0-9a-f]{64}$/)
})
test('non-JSON, cyclic, deeply nested and oversized command data is rejected', () => {
  const cycle: unknown[] = []; cycle.push(cycle)
  let nested: unknown = 0; for (let index = 0; index < 22; index++) nested = { nested }
  for (const value of [undefined, Number.NaN, Infinity, 1n, new Date(), [undefined], cycle, nested, 'x'.repeat(50 * 1024)]) assert.throws(() => canonicalJson(value))
})
test('command scope is restricted to canonical server paths and bounded opaque keys', () => {
  const input = { method: 'POST', canonicalPath: '/api/v1/companies', key: 'synthetic-key', requestId: id, request: {} } as CommandInput
  assert.doesNotThrow(() => validateCommand(input))
  for (const canonicalPath of ['/api/v1/companies?actor=other', 'https://example.test/api/v1/companies', '/api/v1/../users', '/api/v1/Companies']) assert.throws(() => validateCommand({ ...input, canonicalPath }))
  assert.throws(() => validateCommand({ ...input, key: 'x'.repeat(101) }))
})
test('aggregate tags are resource-specific, strong and bounded without numeric precision loss', () => {
  const tag = aggregateEtag('trip', id, 9_007_199_254_740_993n)
  assert.doesNotThrow(() => requireAggregateMatch(tag, tag))
  assert.throws(() => requireAggregateMatch(undefined, tag), { status: 428 })
  for (const candidate of ['*', `W/${tag}`, `${tag},${tag}`, aggregateEtag('order', id, 1n), aggregateEtag('trip', id, 1n)]) assert.throws(() => requireAggregateMatch(candidate, tag), { status: 412 })
  assert.equal(nextAggregateVersion(9_007_199_254_740_993n), 9_007_199_254_740_994n)
  assert.throws(() => nextAggregateVersion(9_223_372_036_854_775_807n))
})
test('replay and audit projections reject secrets, request IDs and unsafe response headers', () => {
  const valid = { outcome: 'succeeded' as const, response: { status: 200, body: { id } }, audit: [{ entityType: 'user', entityId: id, action: 'fixture.changed', after: { isActive: true } }] }
  assert.doesNotThrow(() => validateOutcome(valid))
  for (const field of ['password', 'initialPassword', 'current_password', 'newPassword', 'access_token', 'refreshToken', 'closeCode', 'signedUrl', 'documentNumber', 'documentNumberCiphertext', 'documentNumberKeyId', 'requestId']) {
    assert.throws(() => validateOutcome({ ...valid, response: { status: 200, body: { nested: { [field]: 'private' } } } }))
    assert.throws(() => validateOutcome({ ...valid, audit: [{ ...valid.audit[0]!, before: { [field]: 'private' } }] }))
  }
  assert.throws(() => validateOutcome({ ...valid, response: { ...valid.response, headers: { 'Set-Cookie': 'private' } as never } }))
  assert.throws(() => validateOutcome({ ...valid, response: { status: 204, body: {} } }))
  assert.throws(() => validateOutcome({ ...valid, audit: [] }))
})
test('workflow repositories cannot accept the full client or retain a completed context', async () => {
  type FullClientIsWorkflow = PrismaClient extends WorkflowTransaction ? true : false
  const acceptsFullClient: FullClientIsWorkflow = false
  assert.equal(acceptsFullClient, false)
  await assert.rejects(withWorkflowTransaction({ $connect() {}, $transaction() {} } as never, async () => undefined), /full database client/)
  let captured: WorkflowTransaction | undefined
  await withWorkflowTransaction({ $transaction() {} } as never, async (context) => { assertWorkflowTransaction(context); assert.equal(Reflect.get(context, '$transaction'), undefined); captured = context })
  assert.throws(() => assertWorkflowTransaction(captured!), /active workflow transaction/)
})

test('command fingerprint credentials cannot reuse the signing key or a short key', () => {
  const auth = readAuthConfig({ AUTH_SESSION_KEY: randomBytes(32).toString('base64url') })
  for (const fingerprintKey of [randomBytes(16), auth.key]) assert.throws(() => createCommandExecutor({} as never, { auth, fingerprintKey }), /independent 32-byte/)
})
