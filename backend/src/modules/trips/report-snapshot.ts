import { z } from 'zod';
import { moneySchema } from './trip-validator.ts';
import { minor } from './financial-values.ts';
const id = z.uuid();
const timestamp = z.iso.datetime();
const text = z.string().min(1);
const percent = z.string().regex(/^(?:100\.00|(?:[0-9]|[1-9][0-9])\.[0-9]{2})$/);
const location = z.strictObject({ address: text, latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() }).refine(row => (row.latitude === undefined) === (row.longitude === undefined));
const heuristic = z.strictObject({ distanceKm: z.string().regex(/^(?!0\.00$)(?:0|[1-9][0-9]{0,7})\.[0-9]{2}$/), averageSpeedKmh: z.string().regex(/^(?!0\.00$)(?:0|[1-9][0-9]{0,3})\.[0-9]{2}$/), policyVersion: text.max(50) });
const estimate = z.strictObject({ durationMinutes: z.number().int().positive().nullable(), source: z.enum(['maps', 'distance_heuristic', 'admin_override']).nullable(), heuristic: heuristic.nullable().optional() }).refine(row => row.source === null ? row.durationMinutes === null && !row.heuristic : row.durationMinutes !== null && (row.source === 'distance_heuristic' ? !!row.heuristic : !row.heuristic));
const assignment = z.strictObject({ id, driverId: id, assignedAt: timestamp, endedAt: timestamp, status: z.enum(['replaced', 'completed', 'cancelled']) });
const expense = z.strictObject({ id, driverId: id, category: text.max(50), amount: moneySchema.refine(value => value !== '0.00'), description: text.max(500).regex(/\S/), receiptAssetId: id.nullable(), loggedAt: timestamp });
export const reportSnapshotSchema = z.strictObject({ reportId: id, snapshotVersion: z.literal(1), generatedAt: timestamp, currency: z.literal('INR'), trip: z.strictObject({ id, orderId: id, companyId: id, companyName: text, driver: z.strictObject({ id, name: text }), status: z.literal('closed'), pickup: location, drop: location, contact: z.strictObject({ name: text, phone: text.max(30) }), vehicleNotes: z.string().nullable(), serviceNotes: z.string().nullable(), scheduledPickupAt: timestamp, startedAt: timestamp, closedAt: timestamp, estimate, actualDurationSeconds: z.number().int().nonnegative(), expensesConfirmedAt: timestamp, expensesConfirmedByDriverId: id, assignments: z.array(assignment).min(1) }), expenses: z.array(expense), totalExpenseAmount: moneySchema, payroll: z.strictObject({ id, tripAmount: moneySchema, appliedDriverPercent: percent, appliedCompanyPercent: percent, driverShareAmount: moneySchema, companyShareAmount: moneySchema, totalAmount: moneySchema, paymentStatusAtClosure: z.enum(['unpaid', 'settled', 'disputed']), payoutStatusAtClosure: z.literal('credited') }), walletCredit: z.strictObject({ id, amount: moneySchema }) }).superRefine((row, context) => {
    const p = row.payroll;
    const t = row.trip;
    const valid = p.tripAmount === p.totalAmount && minor(p.driverShareAmount) + minor(p.companyShareAmount) === minor(p.tripAmount) && minor(p.appliedDriverPercent) + minor(p.appliedCompanyPercent) === 10000n && row.walletCredit.amount === p.driverShareAmount && row.expenses.reduce((total, item) => total + minor(item.amount), 0n) === minor(row.totalExpenseAmount) && t.expensesConfirmedByDriverId === t.driver.id && t.startedAt <= t.closedAt && t.expensesConfirmedAt <= t.closedAt && row.generatedAt === t.closedAt && t.assignments.some(item => item.driverId === t.driver.id && item.status === 'completed' && item.endedAt === t.closedAt) && new Set(row.expenses.map(item => item.id)).size === row.expenses.length && new Set(t.assignments.map(item => item.id)).size === t.assignments.length;
    if (!valid)
        context.addIssue({ code: 'custom', message: 'Frozen report identities, timestamps or totals do not reconcile.' });
});
