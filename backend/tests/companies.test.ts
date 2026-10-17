import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { readCommandConfig } from '../src/modules/commands/index.ts'
import { createCompanySchema, patchCompanySchema, splitSchema, createRateSchema, listSchema } from '../src/modules/companies/company-validator.ts'
import { createCompanyCursor } from '../src/modules/companies/company-cursor.ts'

const profile = { legalName: ' Synthetic Company ', displayName: 'Synthetic', contactName: 'Synthetic Contact', contactEmail: 'Contact@example.test', contactPhone: '123456789', billingAddress: 'Synthetic address', initialPayoutRate: { driverPercent: '30.00', companyPercent: '70.00' } }
test('company contracts accept exact valid splits and safely reject malformed or imprecise input', () => {
  for (const [driverPercent, companyPercent] of [['0.01', '99.99'], ['30.00', '70.00'], ['99.99', '0.01']]) assert.ok(splitSchema.safeParse({ driverPercent, companyPercent }).success)
  for (const driverPercent of ['NaN', '1e2', '30', '030.00', '-1.00', '0.00', '100.00', '30.001', 30, null]) assert.equal(splitSchema.safeParse({ driverPercent, companyPercent: '70.00' }).success, false)
  assert.equal(splitSchema.safeParse({ driverPercent: '30.00', companyPercent: '69.99' }).success, false)
})
test('company write DTOs reject scope/status injection and unsupported scheduling', () => {
  assert.equal(createCompanySchema.parse(profile).legalName, 'Synthetic Company')
  assert.equal(createCompanySchema.parse(profile).contactEmail, 'Contact@example.test')
  assert.equal(createCompanySchema.safeParse({ ...profile, isActive: false }).success, false)
  assert.equal(createCompanySchema.safeParse({ ...profile, billingAddress: 'x'.repeat(4001) }).success, false)
  assert.equal(createCompanySchema.safeParse({ ...profile, legalName: 'has\0nul' }).success, false)
  assert.equal(patchCompanySchema.safeParse({}).success, false)
  assert.equal(patchCompanySchema.safeParse({ isActive: false }).success, true)
  assert.equal(patchCompanySchema.safeParse({ companyId: randomUUID() }).success, false)
  assert.equal(createRateSchema.safeParse({ ...profile.initialPayoutRate, reason: 'Synthetic change', effectiveFrom: new Date().toISOString() }).success, false)
})
test('company cursors preserve exact timestamp/id and reject cross-actor, collection and company reuse', () => {
  const codec = createCompanyCursor(randomBytes(32)); const anchor = { id: randomUUID(), createdAt: new Date('2026-10-17T12:00:00.123Z') }
  const scope = 'companies:synthetic-admin:created-desc'; const cursor = codec.encode(scope, anchor)
  assert.deepEqual(codec.decode(scope, cursor), anchor)
  for (const otherScope of ['companies:other-admin:created-desc', 'rates:synthetic-admin:company-a:created-desc', 'companies:synthetic-admin:other-order']) assert.throws(() => codec.decode(otherScope, cursor), { status: 422 })
  const [payload, signature] = cursor.split('.')
  assert.throws(() => codec.decode(scope, `${Buffer.from('{}').toString('base64url')}.${signature}`), { status: 422 })
  assert.throws(() => codec.decode(scope, `${payload}.${signature!.slice(0, 10)}${signature![10] === 'A' ? 'B' : 'A'}${signature!.slice(11)}`), { status: 422 })
})
test('list bounds and command credentials reject invalid configuration without printing supplied values', () => {
  for (const input of [{ limit: 0 }, { limit: 101 }, { search: 'undocumented' }, { cursor: '' }]) assert.equal(listSchema.safeParse(input).success, false)
  assert.deepEqual(listSchema.parse({}), { limit: 25 })
  for (const COMMAND_FINGERPRINT_KEY of [undefined, 'private-weak-input']) {
    assert.throws(() => readCommandConfig({ COMMAND_FINGERPRINT_KEY }), (error: unknown) => error instanceof Error && error.message.includes('Invalid command configuration.') && !error.message.includes('private-weak-input'))
  }
  assert.equal(readCommandConfig({ COMMAND_FINGERPRINT_KEY: randomBytes(32).toString('base64url') }).fingerprintKey.length, 32)
})
