import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { readOrderCodeCipher } from '../src/modules/orders/order-code.ts'
import { parse, createOrderSchema, acceptSchema, orderListSchema } from '../src/modules/orders/order-validator.ts'
const input = { pickup: { address: 'Synthetic pickup' }, drop: { address: 'Synthetic drop' }, contact: { name: 'Synthetic Contact', phone: '123' }, requestedPickupAt: '2026-11-01T10:30:00+05:30' }
test('strict intake validates paired bounded coordinates, dates and server-owned fields', () => {
 assert.equal(parse(createOrderSchema, input).pickup.address, input.pickup.address)
 for (const value of [{ ...input, pickup: { address: 'x', latitude: 10 } }, { ...input, drop: { address: 'x', latitude: 91, longitude: 0 } }, { ...input, requestedPickupAt: '2026-02-30T10:00:00Z' }, { ...input, status: 'accepted' }, { ...input, totalAmount: '1.00' }, { ...input, source: 'partner_portal' }, { ...input, routeDistanceKm: '0.00' }]) assert.throws(() => parse(createOrderSchema, value))
})
test('amounts remain exact contract strings including zero and boundary', () => {
 for (const totalAmount of ['0.00', '1.01', '9999999999.99']) assert.equal(parse(acceptSchema, { totalAmount }).totalAmount, totalAmount)
 for (const totalAmount of [1, '01.00', '-1.00', '1.001', '10000000000.00']) assert.throws(() => parse(acceptSchema, { totalAmount }))
})
test('list rejects unknown fields, empty/negative limits and reversed date ranges', () => {
 for (const value of [{ limit: '' }, { limit: -1 }, { createdFrom: '2026-11-02T00:00:00Z', createdTo: '2026-11-01T00:00:00Z' }, { source: 'admin_manual' }]) assert.throws(() => parse(orderListSchema, value))
})
test('trip code material is randomized, trip-bound, encrypted and versioned', () => {
 const cipher = readOrderCodeCipher({ TRIP_CODE_ENCRYPTION_KEY: randomBytes(32).toString('base64url') })!
 const trip = randomUUID(); const first = cipher.generate(trip); const second = cipher.generate(trip)
 assert.match(cipher.decrypt(trip, first.otpKeyId, first.otpEncryptedValue), /^[0-9]{6}$/)
 assert.notEqual(first.otpEncryptedValue, second.otpEncryptedValue)
 assert.throws(() => cipher.decrypt(randomUUID(), first.otpKeyId, first.otpEncryptedValue))
 assert.throws(() => cipher.decrypt(trip, 'missing', first.otpEncryptedValue))
 assert.match(first.otpHash, /^[a-f0-9]{64}$/)
})
test('trip code config rejects key reuse and supports retained keys', () => {
 const old = randomBytes(32).toString('base64url'); const current = randomBytes(32).toString('base64url'); const trip = randomUUID()
 assert.throws(() => readOrderCodeCipher({ TRIP_CODE_ENCRYPTION_KEY: old, AUTH_SESSION_KEY: old }))
 assert.throws(() => readOrderCodeCipher({ TRIP_CODE_ENCRYPTION_KEY: 'invalid' }))
 const material = readOrderCodeCipher({ TRIP_CODE_ENCRYPTION_KEY: old, TRIP_CODE_KEY_ID: 'old' })!.generate(trip)
 const ring = readOrderCodeCipher({ TRIP_CODE_ENCRYPTION_KEY: current, TRIP_CODE_KEY_ID: 'current', TRIP_CODE_PREVIOUS_KEYS: JSON.stringify({ old }) })!
 assert.match(ring.decrypt(trip, 'old', material.otpEncryptedValue), /^[0-9]{6}$/)
})


test('capture transport refuses production and implicit mail configuration', async () => {
 const { createCaptureTransport } = await import('../src/modules/notifications/capture-transport.ts')
 assert.throws(() => createCaptureTransport({ NODE_ENV: 'production', NOTIFICATION_TRANSPORT: 'capture' }))
 assert.throws(() => createCaptureTransport({ NODE_ENV: 'development' }))
})
