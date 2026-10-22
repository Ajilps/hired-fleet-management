import type { WorkflowInput } from '../../workflows';
import { requestAuthenticatedJson } from '../../../shared/api/api-client';
import { invalidResponse, readId, readObject, readPage, readText, readTimestamp } from '../../../shared/api/response-validation';
const amount = (value: unknown) => typeof value === 'string' && /^(?:0|[1-9]\d{0,11})\.\d{2}$/.test(value) ? value : invalidResponse();
const cents = (value: string) => BigInt(value.replace('.', ''));
const calendar = (value: unknown) => { const text = readText(value); if (!/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(text) || !Number.isFinite(Date.parse(`${text}T00:00:00Z`)))
    return invalidResponse(); return text; };
const nullableTime = (value: unknown) => value === null ? null : readTimestamp(value);
export function readStatementSummary(value: unknown) { const row = readObject(value); if (!['draft', 'pending_verification', 'verified', 'published'].includes(String(row.status)) || row.billingTimezone !== 'Asia/Kolkata' || !Number.isSafeInteger(row.contentVersion) || (row.contentVersion as number) < 1)
    return invalidResponse(); const result = { id: readId(row.id), companyId: readId(row.companyId), periodStart: calendar(row.periodStart), periodEnd: calendar(row.periodEnd), status: String(row.status), contentVersion: row.contentVersion as number, totalTripAmount: amount(row.totalTripAmount), totalDriverShare: amount(row.totalDriverShare), totalCompanyShare: amount(row.totalCompanyShare), createdByUserId: readId(row.createdByUserId), createdAt: readTimestamp(row.createdAt), submittedAt: nullableTime(row.submittedAt), verifiedAt: nullableTime(row.verifiedAt), publishedAt: nullableTime(row.publishedAt), publishedByUserId: row.publishedByUserId === null ? null : readId(row.publishedByUserId) }; const expected = new Date(`${result.periodStart}T00:00:00Z`); expected.setUTCMonth(expected.getUTCMonth() + 1); if (expected.toISOString().slice(0, 10) !== result.periodEnd || cents(result.totalDriverShare) + cents(result.totalCompanyShare) !== cents(result.totalTripAmount) || (result.status === 'published' && (!result.publishedAt || !result.verifiedAt || !result.submittedAt || !result.publishedByUserId)))
    return invalidResponse(); return result; }
export function readStatement(value: unknown) { const row = readObject(value); const summary = readStatementSummary(value); if (!Array.isArray(row.items) || !Array.isArray(row.approvals) || row.approvals.length > 2)
    return invalidResponse(); const items = row.items.map(value => { const item = readObject(value); const result = { tripId: readId(item.tripId), payrollId: readId(item.tripPayrollRecordId), tripAmount: amount(item.tripAmount), driverShareAmount: amount(item.driverShareAmount), companyShareAmount: amount(item.companyShareAmount), driverPercent: amount(item.appliedDriverPercent), companyPercent: amount(item.appliedCompanyPercent) }; if (cents(result.driverShareAmount) + cents(result.companyShareAmount) !== cents(result.tripAmount) || cents(result.driverPercent) + cents(result.companyPercent) !== 10000n)
    return invalidResponse(); return result; }); const approvals = row.approvals.map(value => { const approval = readObject(value); if (approval.contentVersion !== summary.contentVersion || approval.statementId !== summary.id)
    return invalidResponse(); return { id: readId(approval.id), adminUserId: readId(approval.adminUserId), approvedAt: readTimestamp(approval.approvedAt) }; }); if (new Set(items.map(item => item.payrollId)).size !== items.length || new Set(approvals.map(item => item.adminUserId)).size !== approvals.length || items.reduce((sum, item) => sum + cents(item.tripAmount), 0n) !== cents(summary.totalTripAmount) || items.reduce((sum, item) => sum + cents(item.driverShareAmount), 0n) !== cents(summary.totalDriverShare) || items.reduce((sum, item) => sum + cents(item.companyShareAmount), 0n) !== cents(summary.totalCompanyShare) || (['verified', 'published'].includes(summary.status) && (approvals.length !== 2 || !approvals.some(item => item.adminUserId === summary.createdByUserId))))
    return invalidResponse(); return { ...summary, items, approvals }; }
export async function getStatement(id: string, token: string, signal: AbortSignal) { const row = readStatement(await requestAuthenticatedJson(`/api/v1/statements/${id}`, { accessToken: token, signal })); return row.id === id ? row : invalidResponse(); }
export async function listStatements(params: URLSearchParams, token: string, signal: AbortSignal) { const data = readObject(await requestAuthenticatedJson(`/api/v1/statements?${params}`, { accessToken: token, signal })); if (!Array.isArray(data.items))
    return invalidResponse(); const items = data.items.map(readStatementSummary); return { items, pageInfo: readPage(data.pageInfo, items.length, 25) }; }
export async function companyOptions(cursor: string, token: string, signal: AbortSignal) { const params = new URLSearchParams({ limit: '25' }); if (cursor)
    params.set('cursor', cursor); const data = readObject(await requestAuthenticatedJson(`/api/v1/companies?${params}`, { accessToken: token, signal })); if (!Array.isArray(data.items))
    return invalidResponse(); const items = data.items.map(value => { const row = readObject(value); return { id: readId(row.id), name: readText(row.displayName) }; }); return { items, pageInfo: readPage(data.pageInfo, items.length, 25) }; }
export async function currentActor(token: string, signal: AbortSignal) { return readId(readObject(await requestAuthenticatedJson('/api/v1/users/me', { accessToken: token, signal })).id); }
export async function statementCompany(id: string, token: string, signal: AbortSignal) { const row = readObject(await requestAuthenticatedJson(`/api/v1/companies/${id}`, { accessToken: token, signal })); if (readId(row.id) !== id)
    return invalidResponse(); return { id, name: readText(row.displayName), legalName: readText(row.legalName) }; }
export function validateStatementCommand(value: unknown, input: WorkflowInput) {
    const row = readStatement(value);
    const body = readObject(input.body);
    if (input.path === '/api/v1/statements') {
        if (row.companyId !== body.companyId || row.periodStart.slice(0, 7) !== body.billingMonth || row.status !== 'draft' || row.contentVersion !== 1)
            return invalidResponse();
    }
    else {
        const match = /^\/api\/v1\/statements\/([^/]+)\/(regenerate|submit|approvals|publish)$/.exec(input.path);
        if (!match || row.id !== match[1] || !Number.isSafeInteger(body.contentVersion))
            return invalidResponse();
        const action = match[2];
        const version = body.contentVersion as number;
        if (row.contentVersion !== (action === 'regenerate' ? version + 1 : version) ||
            (action === 'regenerate' && row.status !== 'draft') || (action === 'submit' && row.status !== 'pending_verification') ||
            (action === 'approvals' && !['pending_verification', 'verified'].includes(row.status)) || (action === 'publish' && row.status !== 'published'))
            return invalidResponse();
    }
    return row;
}
