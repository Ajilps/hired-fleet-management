import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createAdminSchema, accountStatusSchema, listAccountsSchema } from '../src/modules/accounts/account-validator.ts'
import { createAccountCursor } from '../src/modules/accounts/account-cursor.ts'

test('admin provisioning preserves opaque credentials and rejects foreign role/scope/status', () => {
  const input = { email: 'ADMIN@EXAMPLE.TEST', fullName: ' Synthetic Admin ', role: 'admin', initialPassword: '  synthetic initial password  ' }
  assert.deepEqual(createAdminSchema.parse(input), { ...input, email: 'admin@example.test', fullName: 'Synthetic Admin' })
  for (const extra of [{ role: 'partner' }, { companyId: randomUUID() }, { isActive: false }, { passwordChangeRequired: false }, { initialPassword: 'x'.repeat(14) }, { initialPassword: 'x'.repeat(129) }, { phone: '' }]) assert.equal(createAdminSchema.safeParse({ ...input, ...extra }).success, false)
})
test('status and directory filters are strict and bounded', () => {
  assert.deepEqual(accountStatusSchema.parse({ isActive: false, reason: ' Synthetic reason ' }), { isActive: false, reason: 'Synthetic reason' })
  for (const extra of [{ isActive: 'false' }, { reason: ' ' }, { reason: 'x'.repeat(501) }, { role: 'admin' }, { driverStatus: 'active' }]) assert.equal(accountStatusSchema.safeParse({ isActive: false, reason: 'Synthetic', ...extra }).success, false)
  for (const input of [{ limit: 101 }, { limit: 0 }, { role: 'Admin' }, { isActive: true }, { search: 'undocumented' }, { cursor: '' }]) assert.equal(listAccountsSchema.safeParse(input).success, false)
  assert.deepEqual(listAccountsSchema.parse({ role: 'partner' }), { role: 'partner', limit: 25 })
})
test('account cursors preserve microseconds and bind actor, role filter and collection', () => {
  const codec = createAccountCursor(randomBytes(32)); const scope = 'users:admin-a:all:created-desc'
  const position = { id: randomUUID(), createdAt: '2030-01-01T00:00:00.123999Z' }
  const cursor = codec.encode(scope, position)
  assert.deepEqual(codec.decode(scope, cursor), position)
  for (const other of ['users:admin-b:all:created-desc', 'users:admin-a:admin:created-desc', 'companies:admin-a:created-desc']) assert.throws(() => codec.decode(other, cursor), { status: 422 })
  assert.throws(() => codec.decode(scope, cursor.replace(/^./, cursor[0] === 'A' ? 'B' : 'A')), { status: 422 })
})
