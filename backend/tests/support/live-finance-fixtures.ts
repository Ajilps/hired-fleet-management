// Synthetic fixture CLI only. Never imported by the application runtime.
import { randomUUID, randomBytes } from 'node:crypto';
import { createDatabase } from '../../src/database/database-client.ts';
import { readEnvironment } from '../../src/config/environment.ts';
import { hashPassword } from '../../src/modules/auth/password-service.ts';
import { readOrderCodeCipher } from '../../src/modules/orders/order-code.ts';
import { reportSnapshotSchema } from '../../src/modules/trips/report-snapshot.ts';
const source = process.env.TEST_DATABASE_URL;
if (process.env.NODE_ENV !== 'test' || !source || source !== process.env.DATABASE_URL || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(source).hostname))
    throw new Error('Fixture CLI requires explicit matching disposable loopback test database URLs.');
const db = createDatabase(readEnvironment({ ...process.env, NODE_ENV: 'test' }));
try {
    if (process.argv[2] === 'actors') {
        const adminId = process.env.FIXTURE_ADMIN_ID!;
        if (!adminId)
            throw new Error('Fixture admin identity is required.');
        const password = process.env.FIXTURE_PASSWORD!;
        if (!password)
            throw new Error('Synthetic fixture password is required.');
        const now = new Date();
        const hash = await hashPassword(password);
        const ids = { driverId: randomUUID(), driverEmail: `synthetic-live-driver-${randomUUID()}@example.test`, secondAdminEmail: `synthetic-live-reviewer-${randomUUID()}@example.test` };
        const userId = randomUUID();
        await db.client.user.create({ data: { id: userId, email: ids.driverEmail, passwordHash: hash, role: 'Driver', fullName: 'Synthetic Live Driver', phone: '123456789', createdAt: now, updatedAt: now } });
        await db.client.user.create({ data: { id: randomUUID(), email: ids.secondAdminEmail, passwordHash: hash, role: 'Admin', fullName: 'Synthetic Second Admin', createdAt: now, updatedAt: now } });
        await db.client.driver.create({ data: { id: ids.driverId, userId, createdAt: now, updatedAt: now } });
        for (const documentType of ['DrivingLicense', 'Aadhar', 'Pan', 'Pcc'] as const) {
            const fileId = randomUUID();
            await db.client.fileAsset.create({ data: { id: fileId, storageKey: `quarantine/${fileId}`, originalFilename: 'synthetic-previously-clean.pdf', mimeType: 'application/pdf', byteSize: 100n, checksumSha256: 'a'.repeat(64), malwareScanStatus: 'clean', purpose: 'driver_document', driverId: ids.driverId, uploadedByUserId: userId, createdAt: now } });
            await db.client.driverDocument.create({ data: { id: randomUUID(), driverId: ids.driverId, documentType, fileAssetId: fileId, uploadedAt: now } });
        }
        await db.client.driver.update({ where: { id: ids.driverId }, data: { status: 'Active', onboardedAt: now, activatedByUserId: adminId } });
        process.stdout.write(JSON.stringify(ids));
    }
    else if (process.argv[2] === 'history') {
        const id = process.env.FIXTURE_CLOSED_TRIP_ID!;
        const original = await db.client.trip.findUniqueOrThrow({ where: { id } });
        if (original.status !== 'closed')
            throw new Error('Fixture source must be closed.');
        const order = await db.client.order.findUniqueOrThrow({ where: { id: original.orderId } });
        const p = await db.client.tripPayrollRecord.findUniqueOrThrow({ where: { tripId: id } });
        const ledger = await db.client.walletTransaction.findUniqueOrThrow({ where: { tripId: id } });
        const report = await db.client.tripReport.findUniqueOrThrow({ where: { tripId: id } });
        const now = new Date();
        const closedAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 12));
        const startedAt = new Date(closedAt.getTime() - 3600000);
        const tripId = randomUUID(), orderId = randomUUID(), payrollId = randomUUID(), reportId = randomUUID(), creditId = randomUUID(), assignmentId = randomUUID();
        const cipher = readOrderCodeCipher({ TRIP_CODE_ENCRYPTION_KEY: randomBytes(32).toString('base64url') })!;
        const prior = reportSnapshotSchema.parse(report.reportSnapshot);
        if (!await db.client.companyPayoutRate.findFirst({ where: { companyId: original.companyId, effectiveFrom: { lte: closedAt } } })) {
            const first = await db.client.companyPayoutRate.findFirstOrThrow({ where: { companyId: original.companyId }, orderBy: { effectiveFrom: 'asc' } });
            await db.client.companyPayoutRate.create({ data: { id: randomUUID(), companyId: original.companyId, driverPercent: p.appliedDriverPercent, companyPercent: p.appliedCompanyPercent, effectiveFrom: new Date('2000-01-01T00:00:00Z'), effectiveTo: first.effectiveFrom, createdByUserId: order.acceptedByUserId!, createdAt: new Date('2000-01-01T00:00:00Z') } });
        }
        const expenses = prior.expenses.map(item => ({ ...item, id: randomUUID(), loggedAt: startedAt.toISOString() }));
        const snapshot = reportSnapshotSchema.parse({ ...prior, reportId, generatedAt: closedAt.toISOString(), trip: { ...prior.trip, id: tripId, orderId, scheduledPickupAt: startedAt.toISOString(), startedAt: startedAt.toISOString(), closedAt: closedAt.toISOString(), expensesConfirmedAt: closedAt.toISOString(), actualDurationSeconds: 3600, assignments: [{ id: assignmentId, driverId: p.driverId, assignedAt: startedAt.toISOString(), endedAt: closedAt.toISOString(), status: 'completed' }] }, expenses, payroll: { ...prior.payroll, id: payrollId }, walletCredit: { ...prior.walletCredit, id: creditId } });
        await db.client.$transaction(async (tx) => {
            await tx.order.create({ data: { ...order, id: orderId, acceptedAt: startedAt, requestedPickupAt: startedAt, createdAt: startedAt, updatedAt: startedAt } });
            // Insert complete historical synthetic records in one transaction. No runtime
            // clock override, backdating endpoint or immutable-row update is introduced.
            await tx.trip.create({ data: { ...original, id: tripId, orderId, version: 1n, status: 'ongoing', ...cipher.generate(tripId), scheduledPickupAt: startedAt, assignedAt: startedAt, startedAt, closedAt: null, expensesConfirmedAt: null, expensesConfirmedByDriverId: null, otpGeneratedAt: startedAt, otpVerifiedAt: null, createdAt: startedAt, updatedAt: startedAt } });
            await tx.tripAssignment.create({ data: { id: assignmentId, tripId, driverId: p.driverId, assignedByUserId: order.acceptedByUserId!, status: 'active', assignedAt: startedAt, endedAt: null } });
            for (const item of expenses)
                await tx.tripExpense.create({ data: { id: item.id, tripId, driverId: item.driverId, expenseType: item.category, amount: item.amount, description: item.description, loggedAt: startedAt, createdAt: startedAt, updatedAt: startedAt } });
            await tx.tripAssignment.update({ where: { id: assignmentId }, data: { status: 'completed', endedAt: closedAt } });
            await tx.trip.update({ where: { id: tripId }, data: { status: 'closed', closedAt, otpVerifiedAt: closedAt, expensesConfirmedAt: closedAt, expensesConfirmedByDriverId: p.driverId, version: { increment: 1 }, updatedAt: closedAt } });
            await tx.tripPayrollRecord.create({ data: { ...p, id: payrollId, tripId, calculatedAt: closedAt } });
            await tx.walletTransaction.create({ data: { ...ledger, id: creditId, tripId, payrollRecordId: payrollId, idempotencyKey: `close-trip:${tripId}`, createdAt: closedAt } });
            await tx.walletAccount.update({ where: { driverId: p.driverId }, data: { balance: { increment: p.driverShareAmount }, updatedAt: closedAt } });
            await tx.tripReport.create({ data: { ...report, id: reportId, tripId, payrollRecordId: payrollId, startedAt, closedAt, generatedAt: closedAt, reportSnapshot: snapshot } });
        });
        process.stdout.write(JSON.stringify({ tripId, billingMonth: closedAt.toISOString().slice(0, 7) }));
    }
    else
        throw new Error('Unknown synthetic fixture command.');
}
finally {
    await db.close();
}
