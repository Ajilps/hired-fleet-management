import { Router } from 'express';
import type { PrismaClient, Prisma } from '../../generated/prisma/client.ts';
import type { AuthConfig } from '../auth/index.ts';
import { authenticateTransaction } from '../auth/index.ts';
import { createCompanyCursor } from '../companies/company-cursor.ts';
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts';
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts';
import { createCommandExecutor } from '../commands/index.ts';
import type { CommandActor } from '../commands/command-types.ts';
import { bearer, identity, sendCommand } from '../orders/order-controller.ts';
import { parse, idSchema } from '../orders/order-validator.ts';
import { reportListSchema, walletListSchema, payrollListSchema, paymentSchema } from './trip-validator.ts';
import { reportDto, payrollDto, creditDto } from './finance-mapper.ts';
import { HttpError } from '../../shared/http/http-error.ts';
export function createFinanceRouter(client: PrismaClient, auth: AuthConfig, key: Uint8Array) {
    const router = Router();
    const cursor = createCompanyCursor(key);
    const read = <T>(token: string, roles: readonly ('admin' | 'partner' | 'driver')[], run: (tx: WorkflowTransaction, actor: CommandActor) => Promise<T>) => client.$transaction(tx => withWorkflowTransaction(tx, async (context) => run(context, await authenticateTransaction(context, token, auth, roles))), { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 });
    function page<T>(items: T[], totalCount: number, limit: number, scope: string, position: (row: T) => {
        id: string;
        createdAt: Date;
    }) { const visible = items.slice(0, limit); const hasMore = items.length > limit; return { items: visible, pageInfo: { totalCount, hasMore, nextCursor: hasMore ? cursor.encode(scope, position(visible.at(-1)!)) : null } }; }
    router.get('/trip-reports', async (req, res) => {
        const input = parse(reportListSchema, req.query);
        res.json(await read(bearer(req), ['admin', 'partner', 'driver'], async (tx, actor) => {
            if (actor.role !== 'admin' && (input.companyId || input.driverId))
                throw new HttpError(422, 'VALIDATION_FAILED', 'Only admins may supply company/driver filters.');
            const where: Prisma.TripReportWhereInput = { ...(actor.companyId ? { companyId: actor.companyId } : input.companyId ? { companyId: input.companyId } : {}), ...(actor.driverId ? { driverId: actor.driverId } : input.driverId ? { driverId: input.driverId } : {}), closedAt: { ...(input.closedFrom ? { gte: new Date(input.closedFrom) } : {}), ...(input.closedTo ? { lt: new Date(input.closedTo) } : {}) } };
            const scope = JSON.stringify(['reports', actor.userId, where]);
            const anchor = cursor.decode(scope, input.cursor);
            const total = await tx.tripReport.count({ where });
            const rows = await tx.tripReport.findMany({ where: { AND: [where, anchor ? { OR: [{ generatedAt: { lt: anchor.createdAt } }, { generatedAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}] }, orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 });
            const result = page(rows, total, input.limit, scope, row => ({ id: row.id, createdAt: row.generatedAt }));
            return { ...result, items: result.items.map(reportDto) };
        }));
    });
    router.get('/trip-reports/:reportId', async (req, res) => { const id = parse(idSchema, req.params.reportId); res.json(await read(bearer(req), ['admin', 'partner', 'driver'], async (tx, actor) => { const row = await tx.tripReport.findFirst({ where: { id, ...(actor.companyId ? { companyId: actor.companyId } : {}), ...(actor.driverId ? { driverId: actor.driverId } : {}) } }); if (!row)
        throw new HttpError(404, 'NOT_FOUND', 'Report not found.'); return row.reportSnapshot; })); });
    router.get('/drivers/me/wallet', async (req, res) => { res.json(await read(bearer(req), ['driver'], async (tx, actor) => { const row = await tx.walletAccount.findUnique({ where: { driverId: actor.driverId! } }); const profile = await tx.driver.findUniqueOrThrow({ where: { id: actor.driverId! } }); return { driverId: actor.driverId!, balance: row?.balance.toFixed(2) ?? '0.00', currency: 'INR', updatedAt: (row?.updatedAt ?? profile.createdAt).toISOString() }; })); });
    router.get('/drivers/me/wallet-credits', async (req, res) => {
        const input = parse(walletListSchema, req.query);
        res.json(await read(bearer(req), ['driver'], async (tx, actor) => {
            const where: Prisma.WalletTransactionWhereInput = { driverId: actor.driverId!, createdAt: { ...(input.createdFrom ? { gte: new Date(input.createdFrom) } : {}), ...(input.createdTo ? { lt: new Date(input.createdTo) } : {}) } };
            const scope = JSON.stringify(['credits', actor.userId, where]);
            const anchor = cursor.decode(scope, input.cursor);
            const total = await tx.walletTransaction.aggregate({ where, _count: true, _sum: { amount: true } });
            const rows = await tx.walletTransaction.findMany({ where: { AND: [where, anchor ? { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 });
            const result = page(rows, total._count, input.limit, scope, row => row);
            return { ...result, items: result.items.map(creditDto), totalCreditedAmount: total._sum.amount?.toFixed(2) ?? '0.00' };
        }));
    });
    router.get('/payroll-records', async (req, res) => {
        const input = parse(payrollListSchema, req.query);
        res.json(await read(bearer(req), ['admin'], async (tx, actor) => {
            const where: Prisma.TripPayrollRecordWhereInput = { ...(input.companyIds ? { companyId: { in: input.companyIds } } : {}), ...(input.driverId ? { driverId: input.driverId } : {}), calculatedAt: { ...(input.calculatedFrom ? { gte: new Date(input.calculatedFrom) } : {}), ...(input.calculatedTo ? { lt: new Date(input.calculatedTo) } : {}) } };
            const scope = JSON.stringify(['payroll', actor.userId, where]);
            const anchor = cursor.decode(scope, input.cursor);
            const total = await tx.tripPayrollRecord.count({ where });
            const rows = await tx.tripPayrollRecord.findMany({ where: { AND: [where, anchor ? { OR: [{ calculatedAt: { lt: anchor.createdAt } }, { calculatedAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}] }, orderBy: [{ calculatedAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 });
            const result = page(rows, total, input.limit, scope, row => ({ id: row.id, createdAt: row.calculatedAt }));
            return { ...result, items: result.items.map(payrollDto) };
        }));
    });
    router.get('/payroll-records/:payrollId', async (req, res) => { const id = parse(idSchema, req.params.payrollId); res.json(await read(bearer(req), ['admin'], async (tx) => { const row = await tx.tripPayrollRecord.findUnique({ where: { id } }); if (!row)
        throw new HttpError(404, 'NOT_FOUND', 'Payroll not found.'); return payrollDto(row); })); });
    router.patch('/payroll-records/:payrollId/partner-payment-status', async (req, res) => { const id = parse(idSchema, req.params.payrollId); const input = parse(paymentSchema, req.body); sendCommand(res, await createCommandExecutor(client, { auth, fingerprintKey: key })({ ...identity(req, res), method: 'PATCH', canonicalPath: `/api/v1/payroll-records/${id}/partner-payment-status`, request: input, authorize: async (tx) => { if (!await tx.tripPayrollRecord.findUnique({ where: { id } }))
            throw new HttpError(404, 'NOT_FOUND', 'Payroll not found.'); }, async execute(tx) { await tx.$queryRaw `SELECT id FROM trip_payroll_records WHERE id=${id}::uuid FOR UPDATE`; const before = await tx.tripPayrollRecord.findUniqueOrThrow({ where: { id } }); const after = await tx.tripPayrollRecord.update({ where: { id }, data: { partnerPaymentStatus: input.partnerPaymentStatus } }); return { outcome: 'succeeded', response: { status: 200, body: payrollDto(after) }, audit: [{ entityType: 'trip_payroll_record', entityId: id, action: 'payroll.payment_status_changed', before: { partnerPaymentStatus: before.partnerPaymentStatus }, after: { partnerPaymentStatus: after.partnerPaymentStatus, reason: input.reason } }] }; } })); });
    return router;
}
