import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma, Statement } from '../../generated/prisma/client.ts';
import type { AuthConfig } from '../auth/index.ts';
import { authenticateTransaction } from '../auth/index.ts';
import { createCommandExecutor } from '../commands/index.ts';
import type { CommandActor, CommandOutcome, JsonValue } from '../commands/command-types.ts';
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts';
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts';
import { createCompanyRepository } from '../companies/company-repository.ts';
import { createCompanyCursor } from '../companies/company-cursor.ts';
import { billingPeriod, minor, decimal } from '../trips/financial-values.ts';
import { time } from '../trips/trip-context.ts';
import type { TripIdentity } from '../trips/trip-service.ts';
import { HttpError } from '../../shared/http/http-error.ts';
import { z } from 'zod';
export function statementDto(row: Statement) { return { id: row.id, companyId: row.companyId, periodStart: row.periodStart.toISOString().slice(0, 10), periodEnd: row.periodEnd.toISOString().slice(0, 10), billingTimezone: row.billingTimezone, status: row.status, contentVersion: row.contentVersion, totalTripAmount: row.totalTripAmount.toFixed(2), totalDriverShare: row.totalDriverShare.toFixed(2), totalCompanyShare: row.totalCompanyShare.toFixed(2), createdByUserId: row.createdByUserId, createdAt: row.createdAt.toISOString(), submittedAt: row.submittedAt?.toISOString() ?? null, verifiedAt: row.verifiedAt?.toISOString() ?? null, publishedAt: row.publishedAt?.toISOString() ?? null, publishedByUserId: row.publishedByUserId }; }
export function createStatementService(client: PrismaClient, auth: AuthConfig, key: Uint8Array) {
    const execute = createCommandExecutor(client, { auth, fingerprintKey: key, maxResponseBytes: 4 * 1024 * 1024 });
    const cursor = createCompanyCursor(key);
    async function find(tx: WorkflowTransaction, id: string, actor?: CommandActor) { const row = await tx.statement.findFirst({ where: { id, ...(actor?.role === 'partner' ? { companyId: actor.companyId!, status: 'published' } : {}) } }); if (!row)
        throw new HttpError(404, 'NOT_FOUND', 'Statement not found.'); return row; }
    async function detail(tx: WorkflowTransaction, row: Statement) { const items = await tx.statementItem.findMany({ where: { statementId: row.id }, orderBy: { tripPayrollRecordId: 'asc' } }); const payroll = await tx.tripPayrollRecord.findMany({ where: { id: { in: items.map(item => item.tripPayrollRecordId) } }, select: { id: true, tripId: true } }); const tripIds = new Map(payroll.map(item => [item.id, item.tripId])); const approvals = await tx.statementApproval.findMany({ where: { statementId: row.id }, orderBy: [{ approvedAt: 'asc' }, { id: 'asc' }] }); return { ...statementDto(row), items: items.map(item => ({ tripPayrollRecordId: item.tripPayrollRecordId, tripId: tripIds.get(item.tripPayrollRecordId)!, tripAmount: item.tripAmount.toFixed(2), appliedDriverPercent: item.appliedDriverPercent.toFixed(2), appliedCompanyPercent: item.appliedCompanyPercent.toFixed(2), driverShareAmount: item.driverShareAmount.toFixed(2), companyShareAmount: item.companyShareAmount.toFixed(2) })), approvals: approvals.map(item => ({ id: item.id, statementId: item.statementId, adminUserId: item.adminUserId, contentVersion: item.contentVersion, approvedAt: item.approvedAt.toISOString() })) }; }
    async function content(tx: WorkflowTransaction, id: string, companyId: string, from: Date, to: Date) { const payroll = await tx.tripPayrollRecord.findMany({ where: { companyId, calculatedAt: { gte: from, lt: to } }, orderBy: { id: 'asc' } }); if (!payroll.length)
        throw new HttpError(409, 'NO_ELIGIBLE_TRIPS', 'There are no closed trips in this completed month.'); await tx.statementItem.createMany({ data: payroll.map(row => ({ statementId: id, tripPayrollRecordId: row.id, tripAmount: row.tripAmount, appliedDriverPercent: row.appliedDriverPercent, appliedCompanyPercent: row.appliedCompanyPercent, driverShareAmount: row.driverShareAmount, companyShareAmount: row.companyShareAmount })) }); return { totalTripAmount: decimal(payroll.reduce((sum, row) => sum + minor(row.tripAmount.toFixed(2)), 0n), 99999999999999n), totalDriverShare: decimal(payroll.reduce((sum, row) => sum + minor(row.driverShareAmount.toFixed(2)), 0n), 99999999999999n), totalCompanyShare: decimal(payroll.reduce((sum, row) => sum + minor(row.companyShareAmount.toFixed(2)), 0n), 99999999999999n) }; }
    function result(row: Statement, body: JsonValue, action: string, status = 200): CommandOutcome { return { outcome: 'succeeded', response: { status, body }, audit: [{ entityType: 'statement', entityId: row.id, action, after: { status: row.status, contentVersion: row.contentVersion } }] }; }
    const read = <T>(token: string, run: (tx: WorkflowTransaction, actor: CommandActor) => Promise<T>) => client.$transaction(tx => withWorkflowTransaction(tx, async (context) => run(context, await authenticateTransaction(context, token, auth, ['admin', 'partner']))), { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 });
    return {
        get(token: string, id: string) { return read(token, async (tx, actor) => detail(tx, await find(tx, id, actor))); },
        list(token: string, input: {
            limit: number;
            cursor?: string;
            companyId?: string;
            status?: string;
            billingMonth?: string;
        }) {
            return read(token, async (tx, actor) => {
                if (actor.role === 'partner' && (input.companyId || (input.status && input.status !== 'published')))
                    throw new HttpError(422, 'VALIDATION_FAILED', 'Partners may only request their published statements.');
                const period = input.billingMonth ? new Date(`${input.billingMonth}-01T00:00:00Z`) : undefined;
                const where: Prisma.StatementWhereInput = { ...(actor.role === 'partner' ? { companyId: actor.companyId!, status: 'published' } : { ...(input.companyId ? { companyId: input.companyId } : {}), ...(input.status ? { status: input.status } : {}) }), ...(period ? { periodStart: period } : {}) };
                const scope = JSON.stringify(['statements', actor.userId, where]);
                const anchor = cursor.decode(scope, input.cursor);
                const totalCount = await tx.statement.count({ where });
                const rows = await tx.statement.findMany({ where: { AND: [where, anchor ? { OR: [{ periodStart: { lt: anchor.createdAt } }, { periodStart: anchor.createdAt, id: { lt: anchor.id } }] } : {}] }, orderBy: [{ periodStart: 'desc' }, { id: 'desc' }], take: input.limit + 1 });
                const items = rows.slice(0, input.limit);
                const hasMore = rows.length > input.limit;
                const last = items.at(-1);
                return { items: items.map(statementDto), pageInfo: { totalCount, hasMore, nextCursor: hasMore ? cursor.encode(scope, { id: last!.id, createdAt: last!.periodStart }) : null } };
            });
        },
        async generate(identity: TripIdentity, input: {
            companyId: string;
            billingMonth: string;
        }) { return execute({ ...identity, method: 'POST', canonicalPath: '/api/v1/statements', request: input, authorize: async (tx) => { await createCompanyRepository(tx).find(input.companyId); }, async execute(tx, actor) { await createCompanyRepository(tx).lock(input.companyId); const now = await time(tx); const period = billingPeriod(input.billingMonth, now); const previous = await tx.statement.findFirst({ where: { companyId: input.companyId, periodStart: period.start } }); if (previous)
                throw new HttpError(409, 'STATEMENT_EXISTS', `A statement already exists for this company/month: ${previous.id}.`); const id = randomUUID(); await tx.statement.create({ data: { id, companyId: input.companyId, periodStart: period.start, periodEnd: period.end, createdByUserId: actor.userId, createdAt: now } }); const totals = await content(tx, id, input.companyId, period.from, period.to); const after = await tx.statement.update({ where: { id }, data: { ...totals, version: { increment: 1 } } }); return result(after, await detail(tx, after), 'statement.generated', 201); } }); },
        command(identity: TripIdentity, id: string, action: 'regenerate' | 'submit' | 'approvals' | 'publish', input: {
            contentVersion: number;
        }) {
            return execute({ ...identity, method: 'POST', canonicalPath: `/api/v1/statements/${id}/${action}`, request: input, authorize: async (tx) => { await find(tx, id); }, async execute(tx, actor) {
                    const initial = await find(tx, id);
                    const company = await createCompanyRepository(tx).lock(initial.companyId);
                    await tx.$queryRaw `SELECT id FROM statements WHERE id=${id}::uuid FOR UPDATE`;
                    const row = await find(tx, id);
                    if (row.contentVersion !== input.contentVersion)
                        throw new HttpError(409, 'CONTENT_VERSION_CONFLICT', 'The statement content changed; refresh and review it.');
                    const now = await time(tx);
                    let data: Prisma.StatementUpdateInput = { version: { increment: 1 } };
                    if (action === 'regenerate' || action === 'submit') {
                        if (actor.userId !== row.createdByUserId)
                            throw new HttpError(403, 'CREATOR_REQUIRED', 'Only the creator may change or submit this draft.');
                        if (row.status !== 'draft')
                            throw new HttpError(409, 'STATEMENT_FROZEN', 'Only draft statements may be changed or submitted.');
                        if (action === 'regenerate') {
                            const period = billingPeriod(row.periodStart.toISOString().slice(0, 7), now);
                            await tx.statementItem.deleteMany({ where: { statementId: id } });
                            const totals = await content(tx, id, row.companyId, period.from, period.to);
                            data = { ...data, ...totals, contentVersion: { increment: 1 } };
                        }
                        else
                            data = { ...data, status: 'pending_verification', submittedAt: now };
                    }
                    else if (action === 'approvals') {
                        if (row.status !== 'pending_verification')
                            throw new HttpError(409, 'STATEMENT_STATE_CONFLICT', 'This statement is not awaiting approval.');
                        const approvals = await tx.statementApproval.findMany({ where: { statementId: id } });
                        if (approvals.some(item => item.adminUserId === actor.userId))
                            throw new HttpError(409, 'ALREADY_APPROVED', 'You already approved this content version.');
                        if (approvals.length >= 2 || (actor.userId !== row.createdByUserId && approvals.some(item => item.adminUserId !== row.createdByUserId)))
                            throw new HttpError(409, 'CREATOR_APPROVAL_REQUIRED', 'The creator must be one of the two approvers.');
                        await tx.statementApproval.create({ data: { id: randomUUID(), statementId: id, adminUserId: actor.userId, contentVersion: row.contentVersion, approvedAt: now } });
                        if (approvals.length === 1)
                            data = { ...data, status: 'verified', verifiedAt: now };
                    }
                    else {
                        if (row.status !== 'verified')
                            throw new HttpError(409, 'STATEMENT_NOT_VERIFIED', 'Creator and second-admin approval are required before publication.');
                        const approvals = await tx.statementApproval.findMany({ where: { statementId: id, contentVersion: row.contentVersion } });
                        if (approvals.length !== 2 || !approvals.some(item => item.adminUserId === row.createdByUserId))
                            throw new HttpError(409, 'CREATOR_APPROVAL_REQUIRED', 'Creator and second-admin approval are required.');
                        data = { ...data, status: 'published', publishedAt: now, publishedByUserId: actor.userId };
                        const email = z.email().max(255).safeParse(company.contactEmail);
                        await tx.notification.create({ data: { id: randomUUID(), userId: actor.userId, companyId: row.companyId, statementId: id, eventType: 'statement_published', recipientEmail: email.success ? email.data : null, status: email.success ? 'pending' : 'failed', failureReason: email.success ? null : 'RECIPIENT_MISSING', templateKey: 'statement_published', deduplicationKey: `statement_published:${id}:company-contact:email`, payload: { statementId: id, billingMonth: row.periodStart.toISOString().slice(0, 7) }, nextAttemptAt: now, createdAt: now, updatedAt: now } });
                    }
                    const after = await tx.statement.update({ where: { id }, data });
                    return result(after, await detail(tx, after), `statement.${action}`);
                } });
        },
    };
}
