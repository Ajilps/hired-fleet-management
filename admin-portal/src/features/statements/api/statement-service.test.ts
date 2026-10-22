import { describe, it, expect } from 'vitest';
import { readStatement, validateStatementCommand } from './statement-service';
const id = '11111111-1111-4111-8111-111111111111', company = '22222222-2222-4222-8222-222222222222', other = '33333333-3333-4333-8333-333333333333';
function fixture() { return { id, companyId: company, periodStart: '2026-09-01', periodEnd: '2026-10-01', billingTimezone: 'Asia/Kolkata', status: 'published', contentVersion: 2, totalTripAmount: '0.01', totalDriverShare: '0.01', totalCompanyShare: '0.00', createdByUserId: id, createdAt: '2026-10-01T00:00:00Z', submittedAt: '2026-10-01T01:00:00Z', verifiedAt: '2026-10-01T02:00:00Z', publishedAt: '2026-10-01T03:00:00Z', publishedByUserId: id, items: [{ tripId: id, tripPayrollRecordId: company, tripAmount: '0.01', appliedDriverPercent: '50.00', appliedCompanyPercent: '50.00', driverShareAmount: '0.01', companyShareAmount: '0.00' }], approvals: [{ id, statementId: id, adminUserId: id, contentVersion: 2, approvedAt: '2026-10-01T02:00:00Z' }, { id: other, statementId: id, adminUserId: other, contentVersion: 2, approvedAt: '2026-10-01T02:00:00Z' }] }; }
describe('frozen statement validation', () => {
    it('keeps exact sub-rupee shares and projects only supported fields', () => { const row = readStatement({ ...fixture(), privateNote: 'untrusted extra' }); expect(row.totalDriverShare).toBe('0.01'); expect(row).not.toHaveProperty('privateNote'); });
    it('refuses nonreconciling line totals and swapped company shares', () => { const value = fixture(); expect(() => readStatement({ ...value, totalCompanyShare: '0.01' })).toThrow(); expect(() => readStatement({ ...value, items: [{ ...value.items[0], tripAmount: '0.02' }] })).toThrow(); });
    it('refuses published content without creator approval or matching review version', () => { const value = fixture(); expect(() => readStatement({ ...value, approvals: [value.approvals[1], { ...value.approvals[1], adminUserId: company }] })).toThrow(); expect(() => readStatement({ ...value, approvals: [{ ...value.approvals[0], contentVersion: 1 }, value.approvals[1]] })).toThrow(); });
    it('refuses duplicate lines and non-calendar/excess period boundaries', () => { const value = fixture(); expect(() => readStatement({ ...value, items: [value.items[0], value.items[0]] })).toThrow(); expect(() => readStatement({ ...value, periodEnd: '2026-11-01' })).toThrow(); });
});
it('rejects unrelated saved identities and stale or incorrect action results', () => {
    const row = fixture();
    expect(() => validateStatementCommand(row, { path: `/api/v1/statements/${other}/publish`, body: { contentVersion: 2 } })).toThrow();
    expect(() => validateStatementCommand(row, { path: `/api/v1/statements/${id}/submit`, body: { contentVersion: 2 } })).toThrow();
    expect(() => validateStatementCommand(row, { path: `/api/v1/statements/${id}/publish`, body: { contentVersion: 1 } })).toThrow();
    expect(validateStatementCommand(row, { path: `/api/v1/statements/${id}/publish`, body: { contentVersion: 2 } }).id).toBe(id);
    const draft = { ...row, status: 'draft', contentVersion: 1, approvals: [], submittedAt: null, verifiedAt: null, publishedAt: null, publishedByUserId: null };
    expect(() => validateStatementCommand(draft, { path: '/api/v1/statements', body: { companyId: other, billingMonth: '2026-09' } })).toThrow();
    expect(() => validateStatementCommand(draft, { path: '/api/v1/statements', body: { companyId: company, billingMonth: '2026-08' } })).toThrow();
    expect(validateStatementCommand(draft, { path: '/api/v1/statements', body: { companyId: company, billingMonth: '2026-09' } }).id).toBe(id);
});
