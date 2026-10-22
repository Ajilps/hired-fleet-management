import { randomUUID, createHash } from 'node:crypto';
import type { PrismaClient, Trip, Prisma } from '../../generated/prisma/client.ts';
import type { AuthConfig } from '../auth/index.ts';
import { authenticateTransaction } from '../auth/index.ts';
import { createCommandExecutor, aggregateEtag, requireAggregateMatch } from '../commands/index.ts';
import type { CommandActor, CommandOutcome, JsonValue } from '../commands/command-types.ts';
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts';
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts';
import { HttpError } from '../../shared/http/http-error.ts';
import { getTrip, lockTrip, projectTrip, ownDriver, ongoing, time } from './trip-context.ts';
import { expenseDto, payrollDto, creditDto } from './finance-mapper.ts';
import { assignmentDto } from '../orders/order-mapper.ts';
import type { OrderCodeCipher } from '../orders/order-code.ts';
import type { ExpenseInput } from './trip-validator.ts';
import { minor, decimal, splitAmount } from './financial-values.ts';
import { reportSnapshotSchema } from './report-snapshot.ts';
export type TripIdentity = {
    accessToken: string;
    key: string;
    requestId: string;
    ifMatch?: string;
    origin?: string;
    csrfGuard?: string;
};
const tag = (row: Trip) => aggregateEtag('trip', row.id, row.version);
export function createLiveTripService(client: PrismaClient, auth: AuthConfig, key: Uint8Array, cipher?: OrderCodeCipher, origins: string[] = []) {
    function write(identity: TripIdentity, id: string, operation: string, method: 'POST' | 'PATCH' | 'DELETE', request: JsonValue, roles: readonly ('admin' | 'driver')[], run: (tx: WorkflowTransaction, actor: CommandActor, row: Trip) => Promise<CommandOutcome>, match = true) {
        return createCommandExecutor(client, { auth, fingerprintKey: key, allowedRoles: roles })({ ...identity, method, canonicalPath: `/api/v1/trips/${id}/${operation}`, request,
            authorize: async (tx, actor) => { await getTrip(tx, actor, id); if (actor.role === 'driver' && (await tx.driver.findUnique({ where: { id: actor.driverId! } }))?.status !== 'Active')
                throw new HttpError(403, 'DRIVER_INELIGIBLE', 'An active driver profile is required for trip commands.'); },
            async execute(tx, actor) { const row = await lockTrip(tx, actor, id); if (match)
                requireAggregateMatch(identity.ifMatch, tag(row)); return run(tx, actor, row); },
        });
    }
    async function updated(tx: WorkflowTransaction, id: string, data: Prisma.TripUpdateInput) { return tx.trip.update({ where: { id }, data: { ...data, version: { increment: 1 }, updatedAt: await time(tx) } }); }
    function success(row: Trip, body: JsonValue, action: string, status = 200): CommandOutcome { return { outcome: 'succeeded', response: { status, body, headers: { ETag: tag(row) } }, audit: [{ entityType: 'trip', entityId: row.id, action, after: { status: row.status, version: row.version.toString() } }] }; }
    async function expenses(tx: WorkflowTransaction, id: string) { const rows = await tx.tripExpense.findMany({ where: { tripId: id }, orderBy: [{ loggedAt: 'asc' }, { id: 'asc' }] }); return { rows, total: decimal(rows.reduce((sum, row) => sum + minor(row.amount.toFixed(2)), 0n)) }; }
    function receipt(input: {
        receiptAssetId?: string | null;
    }) { if (input.receiptAssetId)
        throw new HttpError(422, 'RECEIPT_UPLOAD_UNAVAILABLE', 'Receipt uploads are not yet available; record the expense without an attachment.'); }
    return {
        assign(identity: TripIdentity, id: string, input: {
            driverId: string;
            reason: string;
        }) {
            return write(identity, id, 'assignments', 'POST', input, ['admin'], async (tx, actor, row) => {
                if (row.status === 'closed')
                    throw new HttpError(409, 'TRIP_CLOSED', 'Closed trips cannot be reassigned.');
                if (row.currentDriverId === input.driverId)
                    throw new HttpError(409, 'DRIVER_ALREADY_ASSIGNED', 'This driver is already assigned.');
                await tx.$queryRaw `SELECT u.id FROM users u JOIN drivers d ON d.user_id=u.id WHERE d.id=${input.driverId}::uuid FOR SHARE OF u,d`;
                const driver = await tx.driver.findUnique({ where: { id: input.driverId }, include: { user: true } });
                if (!driver || driver.status !== 'Active' || !driver.user.isActive || driver.user.passwordChangeRequired)
                    throw new HttpError(409, 'DRIVER_INELIGIBLE', 'Choose an enabled active driver who completed password setup.');
                const now = await time(tx);
                await tx.tripAssignment.updateMany({ where: { tripId: id, status: 'active' }, data: { status: 'replaced', endedAt: now } });
                const assignment = await tx.tripAssignment.create({ data: { id: randomUUID(), tripId: id, driverId: input.driverId, assignedByUserId: actor.userId, status: 'active', assignmentReason: input.reason, assignedAt: now } });
                const after = await updated(tx, id, { currentDriverId: driver.id, status: row.status === 'unassigned' ? 'assigned' : row.status, assignedAt: row.assignedAt ?? now, expensesConfirmedAt: null, expensesConfirmedByDriverId: null });
                const result = success(after, { trip: await projectTrip(tx, after), assignment: assignmentDto(assignment) }, 'trip.assigned', 201);
                result.audit[0]!.before = { driverId: row.currentDriverId };
                result.audit[0]!.after = { driverId: driver.id, reason: input.reason };
                return result;
            });
        },
        amount(identity: TripIdentity, id: string, input: {
            totalAmount: string;
            reason: string;
        }) {
            return write(identity, id, 'amount', 'PATCH', input, ['admin'], async (tx, _actor, row) => {
                if (row.status === 'closed')
                    throw new HttpError(409, 'TRIP_CLOSED', 'Closed financial values cannot be edited.');
                const after = await updated(tx, id, { totalAmount: input.totalAmount });
                const result = success(after, await projectTrip(tx, after), 'trip.amount_changed');
                result.audit[0]!.before = { totalAmount: row.totalAmount.toFixed(2) };
                result.audit[0]!.after = { totalAmount: input.totalAmount, reason: input.reason };
                return result;
            });
        },
        start(identity: TripIdentity, id: string) {
            return write(identity, id, 'start', 'POST', {}, ['driver'], async (tx, actor, row) => {
                ownDriver(actor, row);
                if (!['assigned', 'ongoing'].includes(row.status))
                    throw new HttpError(409, 'TRIP_STATE_CONFLICT', 'This trip is not assigned or has already closed.');
                const after = row.status === 'ongoing' ? row : await updated(tx, id, { status: 'ongoing', startedAt: await time(tx) });
                return success(after, await projectTrip(tx, after), 'trip.started');
            });
        },
        expense(identity: TripIdentity, id: string, action: 'create' | 'update' | 'delete', input: Partial<ExpenseInput>, expenseId?: string) {
            const operation = expenseId ? `expenses/${expenseId}` : 'expenses';
            const method = action === 'create' ? 'POST' : action === 'update' ? 'PATCH' : 'DELETE';
            return write(identity, id, operation, method, input, ['driver'], async (tx, actor, row) => {
                ownDriver(actor, row);
                ongoing(row);
                receipt(input);
                const now = await time(tx);
                const previous = expenseId ? await tx.tripExpense.findFirst({ where: { id: expenseId, tripId: id, driverId: actor.driverId! } }) : null;
                if (expenseId && !previous)
                    throw new HttpError(404, 'NOT_FOUND', 'Expense not found.');
                const list = await expenses(tx, id);
                decimal(minor(list.total) - (previous ? minor(previous.amount.toFixed(2)) : 0n) + (action === 'delete' ? 0n : minor(input.amount ?? previous!.amount.toFixed(2))));
                let body: JsonValue = null;
                if (action === 'delete')
                    await tx.tripExpense.delete({ where: { id: expenseId! } });
                else if (action === 'update')
                    body = expenseDto(await tx.tripExpense.update({ where: { id: expenseId! }, data: { ...(input.amount ? { amount: input.amount } : {}), ...(input.description ? { description: input.description } : {}), ...(input.category ? { expenseType: input.category } : {}), ...(input.receiptAssetId === null ? { receiptFileAssetId: null } : {}), updatedAt: now } }));
                else
                    body = expenseDto(await tx.tripExpense.create({ data: { id: randomUUID(), tripId: id, driverId: actor.driverId!, amount: input.amount!, description: input.description!, expenseType: input.category ?? 'other', loggedAt: now, createdAt: now, updatedAt: now } }));
                const after = await tx.trip.findUniqueOrThrow({ where: { id } });
                return success(after, body, `trip.expense_${action}`, action === 'create' ? 201 : action === 'delete' ? 204 : 200);
            });
        },
        confirm(identity: TripIdentity, id: string, input: {
            hasNoExpenses: boolean;
        }) {
            return write({ ...identity, key: `confirm:${createHash('sha256').update(JSON.stringify([identity.ifMatch ?? null, input])).digest('hex')}` }, id, 'expense-confirmation', 'POST', input, ['driver'], async (tx, actor, row) => {
                ownDriver(actor, row);
                ongoing(row);
                const list = await expenses(tx, id);
                if (input.hasNoExpenses !== (list.rows.length === 0))
                    throw new HttpError(409, 'EXPENSE_CONFIRMATION_CONFLICT', 'Review the complete saved expense list before confirming.');
                const now = await time(tx);
                const after = await updated(tx, id, { expensesConfirmedAt: now, expensesConfirmedByDriverId: actor.driverId });
                return success(after, { tripId: id, expensesConfirmedAt: now.toISOString(), expensesConfirmedByDriverId: actor.driverId!, hasNoExpenses: input.hasNoExpenses, totalExpenseAmount: list.total }, 'trip.expenses_confirmed');
            });
        },
        async readExpenses(token: string, id: string) { return client.$transaction(tx => withWorkflowTransaction(tx, async (context) => { const actor = await authenticateTransaction(context, token, auth, ['admin', 'partner', 'driver']); const row = await getTrip(context, actor, id); const list = await expenses(context, id); return { body: { items: list.rows.map(expenseDto), totalExpenseAmount: list.total, expensesConfirmedAt: row.expensesConfirmedAt?.toISOString() ?? null, expensesConfirmedByDriverId: row.expensesConfirmedByDriverId }, etag: tag(row) }; }), { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 }); },
        async reveal(identity: TripIdentity, id: string) {
            return client.$transaction(tx => withWorkflowTransaction(tx, async (context) => {
                const actor = await authenticateTransaction(context, identity.accessToken, auth, ['partner']);
                if (actor.transport === 'browser' && (!origins.includes(identity.origin ?? '') || identity.csrfGuard !== '1'))
                    throw new HttpError(403, 'FORBIDDEN', 'Browser origin or CSRF protection is invalid.');
                const row = await lockTrip(context, actor, id);
                if (row.status === 'closed')
                    throw new HttpError(409, 'TRIP_CLOSED', 'This trip is already closed.');
                if (!cipher)
                    throw new HttpError(503, 'TRIP_CODE_UNAVAILABLE', 'Trip code protection is not configured.');
                let code: string;
                try {
                    code = cipher.decrypt(row.id, row.otpKeyId, row.otpEncryptedValue);
                }
                catch {
                    throw new HttpError(503, 'TRIP_CODE_UNAVAILABLE', 'The protected trip code cannot be read.');
                }
                await context.auditLog.create({ data: { actorUserId: actor.userId, entityType: 'trip', entityId: id, action: 'trip.code_revealed', requestId: identity.requestId, createdAt: await time(context) } });
                return { code, expiresAt: null };
            }), { isolationLevel: 'ReadCommitted', maxWait: 2000, timeout: 5000 });
        },
        close(identity: TripIdentity, id: string, input: {
            code: string;
        }) {
            return write(identity, id, 'close', 'POST', input, ['driver'], async (tx, actor, row) => {
                if (row.status === 'closed') {
                    const p = await tx.tripPayrollRecord.findUniqueOrThrow({ where: { tripId: id } });
                    if (p.driverId !== actor.driverId)
                        throw new HttpError(404, 'NOT_FOUND', 'Trip not found.');
                    const w = await tx.walletTransaction.findUniqueOrThrow({ where: { tripId: id } });
                    const r = await tx.tripReport.findUniqueOrThrow({ where: { tripId: id } });
                    return success(row, { trip: await projectTrip(tx, row), payroll: payrollDto(p), walletCredit: creditDto(w), reportId: r.id }, 'trip.closure_recovered');
                }
                ownDriver(actor, row);
                ongoing(row);
                requireAggregateMatch(identity.ifMatch, tag(row));
                if (!row.expensesConfirmedAt || row.expensesConfirmedByDriverId !== actor.driverId)
                    throw new HttpError(409, 'EXPENSES_NOT_CONFIRMED', 'Confirm all saved expenses before closing.');
                const now = await time(tx);
                if (row.otpLockedUntil && row.otpLockedUntil > now)
                    throw new HttpError(429, 'CLOSE_CODE_LOCKED', 'Close-code entry is temporarily locked.', Math.ceil((row.otpLockedUntil.getTime() - now.getTime()) / 1000));
                if (!cipher)
                    throw new HttpError(503, 'TRIP_CODE_UNAVAILABLE', 'Trip code protection is not configured.');
                let matches: boolean;
                try {
                    matches = cipher.matches(id, row.otpKeyId, row.otpHash, input.code);
                }
                catch {
                    throw new HttpError(503, 'TRIP_CODE_UNAVAILABLE', 'The protected trip code cannot be validated.');
                }
                if (!matches) {
                    const attempts = (row.otpLockedUntil ? 0 : row.otpFailedAttempts) + 1;
                    const locked = attempts >= 5;
                    await tx.trip.update({ where: { id }, data: { otpFailedAttempts: attempts, otpLockedUntil: locked ? new Date(now.getTime() + 900000) : null, updatedAt: now } });
                    return { outcome: 'rejected', response: { status: locked ? 429 : 422, body: { error: { code: locked ? 'CLOSE_CODE_LOCKED' : 'INVALID_CLOSE_CODE', message: locked ? 'Close-code entry is temporarily locked.' : 'The close code is incorrect.', retryAfterSeconds: locked ? 900 : null } } }, audit: [{ entityType: 'trip', entityId: id, action: 'trip.code_rejected', after: { attempts, locked } }] };
                }
                const rate = await tx.companyPayoutRate.findFirst({ where: { companyId: row.companyId, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] } });
                if (!rate)
                    throw new HttpError(409, 'RATE_HISTORY_INVALID', 'The company has no rate effective at closure.');
                const shares = splitAmount(row.totalAmount.toFixed(2), rate.driverPercent.toFixed(2));
                const list = await expenses(tx, id);
                const p = await tx.tripPayrollRecord.create({ data: { id: randomUUID(), tripId: id, driverId: actor.driverId!, companyId: row.companyId, tripAmount: row.totalAmount, appliedDriverPercent: rate.driverPercent, appliedCompanyPercent: rate.companyPercent, ...shares, calculatedAt: now } });
                await tx.walletAccount.upsert({ where: { driverId: actor.driverId! }, create: { driverId: actor.driverId!, balance: '0.00', updatedAt: now }, update: {} });
                await tx.$queryRaw `SELECT driver_id FROM wallet_accounts WHERE driver_id=${actor.driverId!}::uuid FOR UPDATE`;
                const wallet = await tx.walletAccount.findUniqueOrThrow({ where: { driverId: actor.driverId! } });
                decimal(minor(wallet.balance.toFixed(2)) + minor(shares.driverShareAmount));
                const w = await tx.walletTransaction.create({ data: { id: randomUUID(), driverId: actor.driverId!, tripId: id, payrollRecordId: p.id, amount: shares.driverShareAmount, idempotencyKey: `close-trip:${id}`, createdAt: now } });
                await tx.walletAccount.update({ where: { driverId: actor.driverId! }, data: { balance: { increment: shares.driverShareAmount }, updatedAt: now } });
                await tx.tripAssignment.updateMany({ where: { tripId: id, status: 'active', driverId: actor.driverId! }, data: { status: 'completed', endedAt: now } });
                const after = await updated(tx, id, { status: 'closed', closedAt: now, otpVerifiedAt: now });
                const projection = await projectTrip(tx, after);
                const company = await tx.company.findUniqueOrThrow({ where: { id: row.companyId } });
                const assignments = await tx.tripAssignment.findMany({ where: { tripId: id }, orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }] });
                const reportId = randomUUID();
                const snapshot = reportSnapshotSchema.parse({ reportId, snapshotVersion: 1, generatedAt: now.toISOString(), currency: 'INR', trip: { id, orderId: row.orderId, companyId: row.companyId, companyName: company.displayName, driver: { id: actor.driverId!, name: projection.currentDriver!.fullName }, status: 'closed', pickup: projection.pickup, drop: projection.drop, contact: projection.contact, vehicleNotes: row.vehicleNotes, serviceNotes: row.serviceNotes, scheduledPickupAt: row.scheduledPickupAt.toISOString(), startedAt: row.startedAt!.toISOString(), closedAt: now.toISOString(), estimate: { durationMinutes: projection.estimate.durationMinutes, source: projection.estimate.source, heuristic: projection.estimate.heuristic }, actualDurationSeconds: Math.floor((now.getTime() - row.startedAt!.getTime()) / 1000), expensesConfirmedAt: row.expensesConfirmedAt.toISOString(), expensesConfirmedByDriverId: actor.driverId!, assignments: assignments.map(item => ({ id: item.id, driverId: item.driverId, assignedAt: item.assignedAt.toISOString(), endedAt: item.endedAt!.toISOString(), status: item.status })) }, expenses: list.rows.map(item => { const dto = expenseDto(item); return { id: dto.id, driverId: dto.driverId, category: dto.category, amount: dto.amount, description: dto.description, receiptAssetId: dto.receiptAssetId, loggedAt: dto.loggedAt }; }), totalExpenseAmount: list.total, payroll: { id: p.id, tripAmount: p.tripAmount.toFixed(2), appliedDriverPercent: p.appliedDriverPercent.toFixed(2), appliedCompanyPercent: p.appliedCompanyPercent.toFixed(2), ...shares, totalAmount: p.tripAmount.toFixed(2), paymentStatusAtClosure: 'unpaid', payoutStatusAtClosure: 'credited' }, walletCredit: { id: w.id, amount: w.amount.toFixed(2) } });
                await tx.tripReport.create({ data: { id: reportId, tripId: id, payrollRecordId: p.id, driverId: actor.driverId!, companyId: row.companyId, startedAt: row.startedAt!, closedAt: now, totalExpenseAmount: list.total, reportSnapshot: snapshot, generatedAt: now } });
                return success(after, { trip: projection, payroll: payrollDto(p), walletCredit: creditDto(w), reportId }, 'trip.closed');
            }, false);
        },
    };
}
