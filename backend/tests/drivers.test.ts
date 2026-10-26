import { activateDriverSchema } from '../src/modules/drivers/driver-validator.ts'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createDriverSchema, listDriversSchema } from '../src/modules/drivers/driver-validator.ts'
import { createDriverCursor } from '../src/modules/drivers/driver-cursor.ts'

test('driver provisioning keeps credentials opaque and refuses client-owned scope/state', () => {
 const body = { email: 'DRIVER@EXAMPLE.TEST', fullName: ' Synthetic Driver ', phone: ' 123 ', initialPassword: '  synthetic driver password  ', dateOfBirth: '2000-02-29' }
 assert.deepEqual(createDriverSchema.parse(body), { ...body, email: 'driver@example.test', fullName: 'Synthetic Driver', phone: '123' })
 for (const extra of [{ role: 'admin' }, { status: 'active' }, { isOnline: true }, { userId: randomUUID() }, { driverId: randomUUID() }, { onboardedAt: new Date().toISOString() }, { passwordChangeRequired: false }, { initialPassword: 'x'.repeat(14) }, { dateOfBirth: '2001-02-29' }, { dateOfBirth: '2999-01-01' }, { phone: ' ' }]) assert.equal(createDriverSchema.safeParse({ ...body, ...extra }).success, false)
})
test('driver filters reject undocumented search and parse false without boolean coercion', () => {
 assert.deepEqual(listDriversSchema.parse({ isOnline: 'false', status: 'pending' }), { limit: 25, isOnline: false, status: 'pending' })
 for (const body of [{ isOnline: '0' }, { isOnline: false }, { status: 'Admin' }, { limit: 101 }, { cursor: '' }, { search: 'unsupported' }, { userId: randomUUID() }]) assert.equal(listDriversSchema.safeParse(body).success, false)
})
test('driver cursors preserve microseconds and bind actor/filter/collection', () => {
 const codec = createDriverCursor(randomBytes(32)); const position = { id: randomUUID(), createdAt: '2026-01-01T00:00:00.123456Z' }; const scope = 'drivers:operator:pending:false:created-desc'; const token = codec.encode(scope, position)
 assert.deepEqual(codec.decode(scope, token), position)
 for (const other of ['drivers:other:pending:false:created-desc','drivers:operator:active:false:created-desc','drivers:operator:pending:true:created-desc','users:operator:pending:false:created-desc']) assert.throws(() => codec.decode(other, token), { status: 422 })
 assert.throws(() => codec.decode(scope, token + 'x'), { status: 422 })
})

test('initial activation accepts only active with a bounded reason and rejects state injection', () => {
  assert.ok(activateDriverSchema.safeParse({ status: 'active', reason: 'Synthetic readiness check' }).success)
  for (const value of [{ status: 'suspended', reason: 'Synthetic' }, { status: 'active', reason: '' }, { status: 'active', reason: 'x'.repeat(501) }, { status: 'active', reason: 'Synthetic', onboardedAt: new Date().toISOString() }]) assert.equal(activateDriverSchema.safeParse(value).success, false)
})
