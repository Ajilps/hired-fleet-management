import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import { Router } from 'express';
import { Client } from 'pg';
import request from 'supertest';
import { createDatabase } from '../../src/database/database-client.ts';
import { readEnvironment } from '../../src/config/environment.ts';
import { createApp } from '../../src/app.ts';
import { readAuthConfig } from '../../src/modules/auth/index.ts';
import { signAccessToken } from '../../src/modules/auth/token-service.ts';
import { createOrderRouter, readOrderCodeCipher } from '../../src/modules/orders/index.ts';
import { createCompanyRouter } from '../../src/modules/companies/index.ts';
import { createLiveTripRouter } from '../../src/modules/trips/index.ts';
import { createStatementRouter } from '../../src/modules/statements/index.ts';
import { reportSnapshotSchema } from '../../src/modules/trips/report-snapshot.ts';
import { splitAmount } from '../../src/modules/trips/financial-values.ts';
if (!process.env.TEST_DATABASE_URL)
    throw new Error('Explicit disposable TEST_DATABASE_URL is required.');
const name = `hired_finance_${randomBytes(6).toString('hex')}`;
const url = new URL(process.env.TEST_DATABASE_URL);
url.pathname = `/${name}`;
const parent = new Client({ connectionString: process.env.TEST_DATABASE_URL });
const sql = new Client({ connectionString: url.toString() });
const db = createDatabase(readEnvironment({ NODE_ENV: 'test', DATABASE_URL: url.toString() }));
const auth = readAuthConfig({ AUTH_SESSION_KEY: randomBytes(32).toString('base64url') });
const key = randomBytes(32);
const cipher = readOrderCodeCipher({ TRIP_CODE_ENCRYPTION_KEY: randomBytes(32).toString('base64url') })!;
const routes = Router();
routes.use(createOrderRouter(db.client, auth, key, cipher));
routes.use(createLiveTripRouter(db.client, auth, key, cipher));
routes.use(createCompanyRouter(db.client, auth, key));
routes.use(createStatementRouter(db.client, auth, key));
const app = createApp({ corsOrigins: [] }, db, () => false, routes);
type Actor = {
    id: string;
    token: string;
    driverId?: string;
};
let admin: Actor;
let second: Actor;
let third: Actor;
let partner: Actor;
let foreign: Actor;
let driver: Actor;
let replacement: Actor;
let companyId: string;
async function actor(role: 'Admin' | 'Partner' | 'Driver', company?: string): Promise<Actor> {
    const id = randomUUID();
    const session = randomUUID();
    const now = new Date();
    await db.client.user.create({ data: { id, email: `synthetic-${id}@example.test`, passwordHash: 'synthetic-unused', role, fullName: 'Synthetic Finance Actor', phone: '123', createdAt: now, updatedAt: now } });
    if (company)
        await db.client.companyUser.create({ data: { companyId: company, userId: id, createdAt: now } });
    let driverId: string | undefined;
    if (role === 'Driver') {
        driverId = randomUUID();
        await db.client.driver.create({ data: { id: driverId, userId: id, createdAt: now, updatedAt: now } });
        for (const documentType of ['DrivingLicense', 'Aadhar', 'Pan', 'Pcc'] as const) {
            const fileId = randomUUID();
            await db.client.fileAsset.create({ data: { id: fileId, storageKey: `quarantine/${fileId}`, originalFilename: 'synthetic.pdf', mimeType: 'application/pdf', byteSize: 100n, checksumSha256: 'a'.repeat(64), malwareScanStatus: 'clean', purpose: 'driver_document', driverId, uploadedByUserId: id, createdAt: now } });
            await db.client.driverDocument.create({ data: { id: randomUUID(), driverId, documentType, fileAssetId: fileId, uploadedAt: now } });
        }
        await db.client.driver.update({ where: { id: driverId }, data: { status: 'Active', onboardedAt: now, activatedByUserId: admin.id } });
    }
    await db.client.authSession.create({ data: { id: session, userId: id, refreshTokenHash: randomUUID(), createdAt: now, expiresAt: new Date(Date.now() + 3600000) } });
    return { id, driverId, token: await signAccessToken(id, session, new Date(Date.now() + 3600000), auth) };
}
function get(path: string, user = admin) { return request(app).get(`/api/v1/${path}`).set('Authorization', `Bearer ${user.token}`); }
function command(path: string, body: object, user = admin, etag?: string, keyValue = randomUUID(), method: 'post' | 'patch' | 'delete' = 'post') {
    const req = request(app)[method](`/api/v1/${path}`).set('Authorization', `Bearer ${user.token}`).set('Idempotency-Key', keyValue);
    if (etag)
        req.set('If-Match', etag);
    return req.send(body);
}
async function company() { const response = await command('companies', { legalName: 'Synthetic Finance', displayName: 'Synthetic Finance', contactName: 'Synthetic Contact', contactEmail: 'synthetic-finance@example.test', contactPhone: '123', billingAddress: 'Synthetic', initialPayoutRate: { driverPercent: '50.00', companyPercent: '50.00' } }).expect(201); return response.body.id as string; }
before(async () => {
    await parent.connect();
    await parent.query(`CREATE DATABASE "${name}"`);
    await sql.connect();
    for (const migration of (await readdir(new URL('../../prisma/migrations/', import.meta.url))).filter(value => value !== 'migration_lock.toml').sort())
        await sql.query(await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8'));
    admin = await actor('Admin');
    second = await actor('Admin');
    third = await actor('Admin');
    companyId = await company();
    partner = await actor('Partner', companyId);
    foreign = await actor('Partner', await company());
    driver = await actor('Driver');
    replacement = await actor('Driver');
});
after(async () => { await db.close(); await sql.end(); await parent.query(`DROP DATABASE IF EXISTS "${name}" WITH(FORCE)`); await parent.end(); });
async function trip(amount = '10.01') { const order = await command('orders', { pickup: { address: 'Synthetic pickup' }, drop: { address: 'Synthetic drop' }, requestedPickupAt: '2026-11-01T05:00:00Z', contact: { name: 'Synthetic', phone: '123' } }, partner).expect(201); const detail = await get(`orders/${order.body.id}`).expect(200); const accepted = await command(`orders/${order.body.id}/accept`, { totalAmount: amount }, admin, detail.headers.etag).expect(200); return accepted.body.trip.id as string; }
async function tag(id: string, user = admin) { return (await get(`trips/${id}`, user).expect(200)).headers.etag!; }
async function assign(id: string, user = driver) { return command(`trips/${id}/assignments`, { driverId: user.driverId!, reason: 'Synthetic assignment' }, admin, await tag(id)).expect(201); }
async function start(id: string, user = driver) { await assign(id, user); return command(`trips/${id}/start`, {}, user, await tag(id, user)).expect(200); }
async function confirm(id: string, user = driver, empty = true) { return command(`trips/${id}/expense-confirmation`, { hasNoExpenses: empty }, user, await tag(id, user)).expect(200); }
async function code(id: string) { return (await command(`trips/${id}/close-code/reveal`, {}, partner).expect(200)).body.code as string; }
async function close(id: string, user = driver) { return command(`trips/${id}/close`, { code: await code(id) }, user, await tag(id, user)).expect(200); }
async function ready(amount = '10.01') { const id = await trip(amount); await start(id); await confirm(id); return id; }
async function finances(id: string) { return [await db.client.tripPayrollRecord.count({ where: { tripId: id } }), await db.client.walletTransaction.count({ where: { tripId: id } }), await db.client.tripReport.count({ where: { tripId: id } })]; }
test('assignment exposes safe driver contact and transfers operational access/history atomically', async () => {
    const id = await trip();
    await get(`trips/${id}`, driver).expect(404);
    await assign(id);
    const detail = await get(`trips/${id}`, partner).expect(200);
    assert.equal(detail.body.currentDriver.id, driver.driverId);
    assert.equal(detail.body.currentDriver.phone, '123');
    await get(`trips/${id}`, replacement).expect(404);
    await command(`trips/${id}/start`, {}, driver, await tag(id, driver)).expect(200);
    const old = await db.client.trip.findUniqueOrThrow({ where: { id } });
    await confirm(id);
    await assign(id, replacement);
    const after = await db.client.trip.findUniqueOrThrow({ where: { id } });
    assert.equal(after.startedAt?.toISOString(), old.startedAt?.toISOString());
    assert.equal(after.expensesConfirmedAt, null);
    await get(`trips/${id}`, driver).expect(404);
    await command(`trips/${id}/start`, {}, driver, await tag(id)).expect(404);
    const history = await get(`trips/${id}/assignments`).expect(200);
    assert.equal(history.body.pageInfo.totalCount, 2);
    assert.equal(history.body.items.filter((row: {
        status: string;
    }) => row.status === 'active').length, 1);
});
test('expense commands require current versions and invalidate complete-list confirmation', async () => {
    const id = await trip();
    await start(id);
    const before = await tag(id, driver);
    await command(`trips/${id}/expenses`, { amount: '0.00', description: 'Invalid' }, driver, before).expect(422);
    const saved = await command(`trips/${id}/expenses`, { amount: '1.23', description: 'Synthetic parking' }, driver, before).expect(201);
    assert.equal(saved.body.category, 'other');
    await command(`trips/${id}/expenses`, { amount: '1.00', description: 'Stale' }, driver, before).expect(412);
    await command(`trips/${id}/expense-confirmation`, { hasNoExpenses: true }, driver, await tag(id, driver)).expect(409);
    await confirm(id, driver, false);
    await command(`trips/${id}/expenses/${saved.body.id}`, { amount: '2.34' }, driver, await tag(id, driver), randomUUID(), 'patch').expect(200);
    const list = await get(`trips/${id}/expenses`, partner).expect(200);
    assert.equal(list.body.totalExpenseAmount, '2.34');
    assert.equal(list.body.expensesConfirmedAt, null);
    await get(`trips/${id}/expenses`, foreign).expect(404);
    await command(`trips/${id}/expenses/${saved.body.id}`, {}, driver, await tag(id, driver), randomUUID(), 'delete').expect(204);
    await confirm(id);
});
test('close-code reveal is partner-only and never enters replay or audit content', async () => {
    const id = await trip();
    for (const user of [admin, driver, foreign])
        await command(`trips/${id}/close-code/reveal`, {}, user).expect(user === foreign ? 404 : 403);
    const value = await code(id);
    assert.match(value, /^[0-9]{6}$/);
    const audit = await db.client.auditLog.findMany({ where: { entityId: id, action: 'trip.code_revealed' } });
    assert.equal(audit.length, 1);
    assert.equal(audit[0]!.afterData, null);
    const replays = await db.client.commandReplay.count({ where: { canonicalPath: `/api/v1/trips/${id}/close-code/reveal` } });
    assert.equal(replays, 0);
});
test('closure freezes exact half-up payroll/report/credit and expenses remain separate', async () => {
    const id = await trip('0.01');
    await start(id);
    await command(`trips/${id}/expenses`, { amount: '2.01', description: 'Synthetic toll' }, driver, await tag(id, driver)).expect(201);
    await confirm(id, driver, false);
    const result = await close(id);
    assert.equal(result.body.payroll.driverShareAmount, '0.01');
    assert.equal(result.body.payroll.companyShareAmount, '0.00');
    assert.equal(result.body.walletCredit.amount, '0.01');
    assert.deepEqual(await finances(id), [1, 1, 1]);
    const report = await get(`trip-reports/${result.body.reportId}`, partner).expect(200);
    assert.equal(report.body.totalExpenseAmount, '2.01');
    assert.equal(report.body.payroll.totalAmount, '0.01');
    assert.equal(report.body.trip.driver.id, driver.driverId);
    assert.equal(report.body.trip.assignments.at(-1).status, 'completed');
    await get(`trip-reports/${result.body.reportId}`, foreign).expect(404);
    await command(`trips/${id}/close-code/reveal`, {}, partner).expect(409);
});
test('wrong-code replay counts once, five failures persist and lockout cannot be bypassed by new keys', async () => {
    const id = await ready();
    const actual = await code(id);
    const wrong = actual === '000000' ? '000001' : '000000';
    const etag = await tag(id, driver);
    const commandKey = randomUUID();
    const first = await command(`trips/${id}/close`, { code: wrong }, driver, etag, commandKey).expect(422);
    assert.ok(first.body.error.requestId);
    await command(`trips/${id}/close`, { code: wrong }, driver, etag, commandKey).expect(422);
    assert.equal((await db.client.trip.findUniqueOrThrow({ where: { id } })).otpFailedAttempts, 1);
    for (let i = 2; i <= 5; i++)
        await command(`trips/${id}/close`, { code: wrong }, driver, etag).expect(i === 5 ? 429 : 422);
    const locked = await command(`trips/${id}/close`, { code: actual }, driver, etag).expect(429);
    assert.ok(Number(locked.headers['retry-after']) > 0);
    assert.deepEqual(await finances(id), [0, 0, 0]);
    await db.client.trip.update({ where: { id }, data: { otpLockedUntil: new Date(0) } });
    await command(`trips/${id}/close`, { code: actual }, driver, etag).expect(200);
});
test('concurrent closure and recovery after replay expiry preserve one permanent result', async () => {
    const id = await ready();
    const value = await code(id);
    const etag = await tag(id, driver);
    const results = await Promise.all([command(`trips/${id}/close`, { code: value }, driver, etag), command(`trips/${id}/close`, { code: value }, driver, etag)]);
    assert.deepEqual(results.map(row => row.status), [200, 200]);
    assert.equal(results[0]!.body.reportId, results[1]!.body.reportId);
    assert.deepEqual(await finances(id), [1, 1, 1]);
    await db.client.commandReplay.updateMany({ where: { canonicalPath: `/api/v1/trips/${id}/close` }, data: { createdAt: new Date(0), expiresAt: new Date(1000) } });
    const recovered = await command(`trips/${id}/close`, { code: '999999' }, driver, etag).expect(200);
    assert.equal(recovered.body.reportId, results[0]!.body.reportId);
    assert.deepEqual(await finances(id), [1, 1, 1]);
});
test('injected report failure rolls back trip, payroll, credit, wallet and command result', async () => {
    const id = await ready();
    const value = await code(id);
    const etag = await tag(id, driver);
    const wallet = await db.client.walletAccount.findUnique({ where: { driverId: driver.driverId! } });
    const keyValue = randomUUID();
    await sql.query("CREATE FUNCTION fixture_report_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure';END $$;CREATE TRIGGER fixture_report_failure BEFORE INSERT ON trip_reports FOR EACH ROW EXECUTE FUNCTION fixture_report_failure()");
    try {
        await command(`trips/${id}/close`, { code: value }, driver, etag, keyValue).expect(500);
        assert.deepEqual(await finances(id), [0, 0, 0]);
        assert.equal((await db.client.trip.findUniqueOrThrow({ where: { id } })).status, 'ongoing');
        assert.equal((await db.client.walletAccount.findUnique({ where: { driverId: driver.driverId! } }))?.balance.toFixed(2), wallet?.balance.toFixed(2));
    }
    finally {
        await sql.query('DROP TRIGGER fixture_report_failure ON trip_reports;DROP FUNCTION fixture_report_failure()');
    }
    await command(`trips/${id}/close`, { code: value }, driver, etag, keyValue).expect(200);
});
test('closed records remain immutable; external settlement does not change the frozen report', async () => {
    const id = await ready();
    const result = await close(id);
    const report = (await get(`trip-reports/${result.body.reportId}`, partner)).body;
    for (const query of ["UPDATE trips SET total_amount=100,version=version+1 WHERE id=$1", "UPDATE trip_payroll_records SET driver_share_amount=99 WHERE trip_id=$1", "DELETE FROM wallet_transactions WHERE trip_id=$1", "UPDATE trip_reports SET report_snapshot='{}' WHERE trip_id=$1"]) {
        await assert.rejects(sql.query(query, [id]));
    }
    await command(`payroll-records/${result.body.payroll.id}/partner-payment-status`, { partnerPaymentStatus: 'settled', reason: 'Synthetic external settlement' }, admin, undefined, randomUUID(), 'patch').expect(200);
    assert.deepEqual((await get(`trip-reports/${result.body.reportId}`, partner)).body, report);
    await db.client.driver.update({ where: { id: driver.driverId! }, data: { status: 'Inactive' } });
    try {
        await get('drivers/me/wallet', driver).expect(200);
        await get(`trips/${id}`, driver).expect(200);
        await command(`trips/${id}/close`, { code: '000000' }, driver, await tag(id)).expect(403);
    }
    finally {
        await db.client.driver.update({ where: { id: driver.driverId! }, data: { status: 'Active' } });
    }
});
test('rate-edit/closure serialize and frozen shares match the rate selected at closure', async () => {
    const id = await ready('123.45');
    const etag = await tag(id, driver);
    const value = await code(id);
    const results = await Promise.all([command(`companies/${companyId}/payout-rates`, { driverPercent: '33.33', companyPercent: '66.67', reason: 'Synthetic rate race' }), command(`trips/${id}/close`, { code: value }, driver, etag)]);
    assert.equal(results[0]!.status, 201);
    assert.equal(results[1]!.status, 200);
    const p = await db.client.tripPayrollRecord.findUniqueOrThrow({ where: { tripId: id } });
    assert.deepEqual({ driverShareAmount: p.driverShareAmount.toFixed(2), companyShareAmount: p.companyShareAmount.toFixed(2) }, splitAmount('123.45', p.appliedDriverPercent.toFixed(2)));
});
test('reassignment/closure and expense/closure races cannot bypass current ownership/confirmation', async () => {
    const id = await ready();
    const etag = await tag(id, driver);
    const value = await code(id);
    const raced = await Promise.all([command(`trips/${id}/assignments`, { driverId: replacement.driverId!, reason: 'Synthetic race' }, admin, etag), command(`trips/${id}/close`, { code: value }, driver, etag)]);
    assert.ok(raced.some(row => row.status === 200 || row.status === 201));
    const row = await db.client.trip.findUniqueOrThrow({ where: { id } });
    if (row.status === 'closed') {
        assert.deepEqual(await finances(id), [1, 1, 1]);
        assert.equal(raced[0]!.status, 409);
    }
    else {
        assert.equal(row.currentDriverId, replacement.driverId);
        assert.equal(row.expensesConfirmedAt, null);
        assert.equal(raced[1]!.status, 404);
        assert.deepEqual(await finances(id), [0, 0, 0]);
    }
    const another = await ready();
    const fresh = await tag(another, driver);
    const closureCode = await code(another);
    const changes = await Promise.all([command(`trips/${another}/expenses`, { amount: '1.00', description: 'Synthetic racing expense' }, driver, fresh), command(`trips/${another}/close`, { code: closureCode }, driver, fresh)]);
    assert.ok(changes.some(row => row.status === 200 || row.status === 201));
    assert.ok(changes.some(row => [409, 412].includes(row.status)));
    assert.ok((await finances(another))[0]! <= 1);
});
test('financial list totals and cursor access are scoped before pagination', async () => {
    const all = (await get('drivers/me/wallet-credits?limit=1', driver).expect(200)).body;
    assert.equal(all.items.length, 1);
    assert.ok(all.pageInfo.totalCount > 1);
    const next = (await get(`drivers/me/wallet-credits?limit=1&cursor=${encodeURIComponent(all.pageInfo.nextCursor)}`, driver).expect(200)).body;
    assert.equal(next.totalCreditedAmount, all.totalCreditedAmount);
    assert.notEqual(next.items[0].id, all.items[0].id);
    await get(`drivers/me/wallet-credits?cursor=${encodeURIComponent(all.pageInfo.nextCursor)}`, replacement).expect(422);
    assert.equal((await get('trip-reports', foreign).expect(200)).body.pageInfo.totalCount, 0);
    await get('payroll-records', partner).expect(403);
    await get(`trip-reports?companyId=${companyId}`, partner).expect(422);
});
async function historicalTrip(offset = 1, sourceId?: string) {
    const id = sourceId ?? await ready('12.35');
    if (!sourceId) await close(id);
    const original = await db.client.trip.findUniqueOrThrow({ where: { id } });
    const order = await db.client.order.findUniqueOrThrow({ where: { id: original.orderId } });
    const payroll = await db.client.tripPayrollRecord.findUniqueOrThrow({ where: { tripId: id } });
    const ledger = await db.client.walletTransaction.findUniqueOrThrow({ where: { tripId: id } });
    const report = await db.client.tripReport.findUniqueOrThrow({ where: { tripId: id } });
    const now = new Date();
    const closedAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 15, 12));
    const startedAt = new Date(closedAt.getTime() - 3600000);
    if (!await db.client.companyPayoutRate.findFirst({ where: { companyId: original.companyId, effectiveFrom: { lte: closedAt } } })) {
        const first = await db.client.companyPayoutRate.findFirstOrThrow({ where: { companyId: original.companyId }, orderBy: { effectiveFrom: 'asc' } });
        await db.client.companyPayoutRate.create({ data: { id: randomUUID(), companyId: original.companyId, driverPercent: payroll.appliedDriverPercent, companyPercent: payroll.appliedCompanyPercent, effectiveFrom: new Date('2000-01-01T00:00:00Z'), effectiveTo: first.effectiveFrom, createdByUserId: admin.id, createdAt: new Date('2000-01-01T00:00:00Z') } });
    }
    const newId = randomUUID();
    const orderId = randomUUID();
    const payrollId = randomUUID();
    const reportId = randomUUID();
    const creditId = randomUUID();
    const assignmentId = randomUUID();
    const snapshot = reportSnapshotSchema.parse(report.reportSnapshot);
    const frozen = reportSnapshotSchema.parse({ ...snapshot, reportId, generatedAt: closedAt.toISOString(), trip: { ...snapshot.trip, id: newId, orderId, scheduledPickupAt: startedAt.toISOString(), startedAt: startedAt.toISOString(), closedAt: closedAt.toISOString(), expensesConfirmedAt: closedAt.toISOString(), actualDurationSeconds: 3600, assignments: [{ id: assignmentId, driverId: driver.driverId!, assignedAt: startedAt.toISOString(), endedAt: closedAt.toISOString(), status: 'completed' }] }, payroll: { ...snapshot.payroll, id: payrollId }, walletCredit: { ...snapshot.walletCredit, id: creditId } });
    await db.client.$transaction(async (tx) => {
        await tx.order.create({ data: { ...order, id: orderId, acceptedAt: startedAt, requestedPickupAt: startedAt, createdAt: startedAt, updatedAt: startedAt } });
        await tx.trip.create({ data: { ...original, id: newId, orderId, version: 1n, ...cipher.generate(newId), scheduledPickupAt: startedAt, assignedAt: startedAt, startedAt, closedAt, expensesConfirmedAt: closedAt, otpGeneratedAt: startedAt, otpVerifiedAt: closedAt, createdAt: startedAt, updatedAt: closedAt } });
        await tx.tripAssignment.create({ data: { id: assignmentId, tripId: newId, driverId: driver.driverId!, assignedByUserId: admin.id, status: 'completed', assignedAt: startedAt, endedAt: closedAt } });
        await tx.tripPayrollRecord.create({ data: { ...payroll, id: payrollId, tripId: newId, calculatedAt: closedAt } });
        await tx.walletTransaction.create({ data: { ...ledger, id: creditId, tripId: newId, payrollRecordId: payrollId, idempotencyKey: `close-trip:${newId}`, createdAt: closedAt } });
        await tx.walletAccount.update({ where: { driverId: driver.driverId! }, data: { balance: { increment: payroll.driverShareAmount }, updatedAt: closedAt } });
        await tx.tripReport.create({ data: { ...report, id: reportId, tripId: newId, payrollRecordId: payrollId, startedAt, closedAt, generatedAt: closedAt, reportSnapshot: frozen } });
    });
    return { id: newId, billingMonth: closedAt.toISOString().slice(0, 7) };
}
let statementId: string;
let month: string;
const version = { contentVersion: 1 };
test('monthly generation uses completed IST closure month, exact immutable lines and durable replay', async () => {
    const historical = await historicalTrip();
    month = historical.billingMonth;
    const current = new Date().toISOString().slice(0, 7);
    await command('statements', { companyId, billingMonth: current }).expect(409);
    const keyValue = randomUUID();
    const body = { companyId, billingMonth: month };
    const result = await command('statements', body, admin, undefined, keyValue).expect(201);
    statementId = result.body.id;
    assert.equal(result.body.items.length, 1);
    assert.equal(result.body.items[0].tripId, historical.id);
    assert.equal(result.body.totalTripAmount, '12.35');
    assert.equal(result.body.approvals.length, 0);
    assert.deepEqual((await command('statements', body, admin, undefined, keyValue).expect(201)).body, result.body);
    await command('statements', body).expect(409);
    await get(`statements/${statementId}`, partner).expect(404);
    assert.equal((await get('statements', partner).expect(200)).body.pageInfo.totalCount, 0);
    await command(`statements/${statementId}/regenerate`, version, second).expect(403);
});
test('draft regeneration increments content version and only creator can submit a reviewed version', async () => {
    const result = await command(`statements/${statementId}/regenerate`, version).expect(200);
    assert.equal(result.body.contentVersion, 2);
    await command(`statements/${statementId}/submit`, version).expect(409);
    await command(`statements/${statementId}/submit`, { contentVersion: 2 }, second).expect(403);
    const submitted = await command(`statements/${statementId}/submit`, { contentVersion: 2 }).expect(200);
    assert.equal(submitted.body.status, 'pending_verification');
    assert.equal(submitted.body.approvals.length, 0);
    await command(`statements/${statementId}/regenerate`, { contentVersion: 2 }).expect(409);
    await assert.rejects(sql.query('DELETE FROM statement_items WHERE statement_id=$1', [statementId]));
});
test('two noncreators, premature publication, stale content and repeated approvals cannot bypass creator gate', async () => {
    const body = { contentVersion: 2 };
    await command(`statements/${statementId}/publish`, body).expect(409);
    const first = await command(`statements/${statementId}/approvals`, body, second).expect(200);
    assert.equal(first.body.status, 'pending_verification');
    await command(`statements/${statementId}/approvals`, body, third).expect(409);
    await command(`statements/${statementId}/approvals`, body, second).expect(409);
    await command(`statements/${statementId}/approvals`, version).expect(409);
    const approved = await command(`statements/${statementId}/approvals`, body).expect(200);
    assert.equal(approved.body.status, 'verified');
    assert.equal(approved.body.approvals.length, 2);
    await command(`statements/${statementId}/approvals`, body, third).expect(409);
    await get(`statements/${statementId}`, partner).expect(404);
});
test('publication and email intent commit once, frozen totals remain scoped and external status cannot rewrite history', async () => {
    const keyValue = randomUUID();
    const before = (await get(`statements/${statementId}`)).body;
    const responses = await Promise.all([command(`statements/${statementId}/publish`, { contentVersion: 2 }, admin, undefined, keyValue), command(`statements/${statementId}/publish`, { contentVersion: 2 }, admin, undefined, keyValue)]);
    assert.ok(responses.some(row => row.status === 200));
    assert.ok(responses.every(row => row.status === 200 || (row.status === 409 && row.body.error.code === 'COMMAND_IN_PROGRESS')));
    const published = await command(`statements/${statementId}/publish`, { contentVersion: 2 }, admin, undefined, keyValue).expect(200);
    assert.equal(published.body.status, 'published');
    assert.deepEqual(published.body.items, before.items);
    assert.equal(await db.client.notification.count({ where: { statementId, eventType: 'statement_published' } }), 1);
    const visible = await get(`statements/${statementId}`, partner).expect(200);
    assert.equal(visible.body.totalTripAmount, before.totalTripAmount);
    await get(`statements/${statementId}`, foreign).expect(404);
    const list = await get(`statements?billingMonth=${month}&status=published`, partner).expect(200);
    assert.equal(list.body.pageInfo.totalCount, 1);
    await get('statements?status=draft', partner).expect(422);
    await get(`statements?companyId=${companyId}`, partner).expect(422);
    await assert.rejects(sql.query('UPDATE statements SET total_trip_amount=99,version=version+1 WHERE id=$1', [statementId]));
    await assert.rejects(sql.query('DELETE FROM statement_approvals WHERE statement_id=$1', [statementId]));
});
test('concurrent creator/second approvals verify one content version; publication failure rolls back only publication', async () => {
    const historical = await historicalTrip(2);
    const generated = await command('statements', { companyId, billingMonth: historical.billingMonth }).expect(201);
    const id = generated.body.id;
    await command(`statements/${id}/submit`, version).expect(200);
    const approvals = await Promise.all([command(`statements/${id}/approvals`, version, admin), command(`statements/${id}/approvals`, version, second)]);
    assert.deepEqual(approvals.map(row => row.status), [200, 200]);
    assert.equal((await get(`statements/${id}`).expect(200)).body.status, 'verified');
    assert.equal(await db.client.statementApproval.count({ where: { statementId: id } }), 2);
    const keyValue = randomUUID();
    await sql.query("CREATE FUNCTION fixture_publication_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='statement_published' THEN RAISE EXCEPTION 'synthetic failure';END IF;RETURN NEW;END $$;CREATE TRIGGER fixture_publication_failure BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fixture_publication_failure()");
    try {
        await command(`statements/${id}/publish`, version, admin, undefined, keyValue).expect(500);
        assert.equal((await db.client.statement.findUniqueOrThrow({ where: { id } })).status, 'verified');
        assert.equal(await db.client.notification.count({ where: { statementId: id } }), 0);
        await get(`statements/${id}`, partner).expect(404);
    }
    finally {
        await sql.query('DROP TRIGGER fixture_publication_failure ON notifications;DROP FUNCTION fixture_publication_failure()');
    }
    await command(`statements/${id}/publish`, version, admin, undefined, keyValue).expect(200);
});
test('database refuses direct verification without creator approval and frozen line manipulation', async () => {
    const historical = await historicalTrip(3);
    const generated = await command('statements', { companyId, billingMonth: historical.billingMonth }).expect(201);
    const id = generated.body.id;
    await command(`statements/${id}/submit`, version).expect(200);
    await assert.rejects(sql.query("UPDATE statements SET status='verified',verified_at=now(),version=version+1 WHERE id=$1", [id]));
    await assert.rejects(sql.query('UPDATE statement_items SET trip_amount=trip_amount+1 WHERE statement_id=$1', [id]));
    assert.equal((await db.client.statement.findUniqueOrThrow({ where: { id } })).status, 'pending_verification');
});
test('database closure guards reject incorrect rounding, timing and effective rates atomically', async () => {
    const id = await ready('100.01');
    const etag = await tag(id, driver);
    const value = await code(id);
    const mutations = [
        'NEW.driver_share_amount := 0; NEW.company_share_amount := NEW.trip_amount;',
        "NEW.calculated_at := NEW.calculated_at + interval '1 second';",
        'NEW.applied_driver_percent := 40; NEW.applied_company_percent := 60; NEW.driver_share_amount := round(NEW.trip_amount*0.4,2); NEW.company_share_amount := NEW.trip_amount-NEW.driver_share_amount;',
    ];
    for (const mutation of mutations) {
        await sql.query(`CREATE FUNCTION fixture_invalid_payroll() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${mutation} RETURN NEW; END $$; CREATE TRIGGER fixture_invalid_payroll BEFORE INSERT ON trip_payroll_records FOR EACH ROW EXECUTE FUNCTION fixture_invalid_payroll()`);
        try {
            await command(`trips/${id}/close`, { code: value }, driver, etag).expect(500);
            assert.deepEqual(await finances(id), [0, 0, 0]);
            assert.equal((await db.client.trip.findUniqueOrThrow({ where: { id } })).status, 'ongoing');
        }
        finally {
            await sql.query('DROP TRIGGER fixture_invalid_payroll ON trip_payroll_records; DROP FUNCTION fixture_invalid_payroll()');
        }
    }
    await command(`trips/${id}/close`, { code: value }, driver, etag).expect(200);
});


test('large monthly statements persist and replay complete responses through publication', async () => {
    const source = await historicalTrip(4);
    for (let i=0;i<499;i++) await historicalTrip(4,source.id);
    const input={companyId,billingMonth:source.billingMonth};const keyValue=randomUUID();
    const generated=await command('statements',input,admin,undefined,keyValue).expect(201);
    assert.equal(generated.body.items.length,500);
    assert.ok(Buffer.byteLength(JSON.stringify(generated.body))>65536);
    assert.deepEqual((await command('statements',input,admin,undefined,keyValue).expect(201)).body,generated.body);
    const id=generated.body.id;const content={contentVersion:1};
    for(const action of ['submit','approvals'] as const) await command(`statements/${id}/${action}`,content).expect(200);
    await command(`statements/${id}/approvals`,content,second).expect(200);
    const publicationKey=randomUUID();const published=await command(`statements/${id}/publish`,content,admin,undefined,publicationKey).expect(200);
    assert.equal(published.body.items.length,500);
    assert.deepEqual((await command(`statements/${id}/publish`,content,admin,undefined,publicationKey).expect(200)).body,published.body);
    assert.deepEqual((await get(`statements/${id}`,partner).expect(200)).body,published.body);
    // The larger storage allowance is confined to statement commands.
    await assert.rejects(sql.query("UPDATE command_replays SET canonical_path='/api/v1/companies' WHERE actor_user_id=$1 AND idempotency_key=$2",[admin.id,keyValue]));
});
