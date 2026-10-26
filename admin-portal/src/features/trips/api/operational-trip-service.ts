import { requestAuthenticated, requestAuthenticatedJson } from '../../../shared/api/api-client';
import { invalidResponse, readId, readNullableText, readObject, readPage, readText, readTimestamp, readEtag } from '../../../shared/api/response-validation';
import { readTrip } from './trip-service';
const money = (value: unknown) => typeof value === 'string' && /^(?:0|[1-9]\d{0,9})\.\d{2}$/.test(value) ? value : invalidResponse();
export async function listTrips(params: URLSearchParams, token: string, signal: AbortSignal) { const data = readObject(await requestAuthenticatedJson(`/api/v1/trips?${params}`, { accessToken: token, signal })); if (!Array.isArray(data.items))
    return invalidResponse(); const items = data.items.map(readTrip); return { items, pageInfo: readPage(data.pageInfo, items.length, 25) }; }
export async function operationalTrip(id: string, token: string, signal: AbortSignal) { const result = await requestAuthenticated(`/api/v1/trips/${id}`, { accessToken: token, signal }); const data = readObject(result.data); const trip = readTrip(data); if (trip.id !== id)
    return invalidResponse(); const driver = data.currentDriver === null ? null : readObject(data.currentDriver); return { trip, etag: readEtag(result.etag), driver: driver ? { id: readId(driver.id), name: readText(driver.fullName), phone: readNullableText(driver.phone) } : null, startedAt: data.startedAt === null ? null : readTimestamp(data.startedAt), closedAt: data.closedAt === null ? null : readTimestamp(data.closedAt) }; }
export async function activeDrivers(cursor: string, token: string, signal: AbortSignal) { const params = new URLSearchParams({ status: 'active', limit: '25' }); if (cursor)
    params.set('cursor', cursor); const data = readObject(await requestAuthenticatedJson(`/api/v1/drivers?${params}`, { accessToken: token, signal })); if (!Array.isArray(data.items))
    return invalidResponse(); const items = data.items.map(value => { const row = readObject(value); const user = readObject(row.user); if (row.status !== 'active' || typeof row.isOnline !== 'boolean' || typeof user.isActive !== 'boolean')
    return invalidResponse(); return { id: readId(row.id), name: readText(user.fullName), phone: readNullableText(user.phone), online: row.isOnline, eligible: user.isActive && user.passwordChangeRequired !== true }; }); return { items, pageInfo: readPage(data.pageInfo, items.length, 25) }; }
export async function tripHistory(id: string, cursor: string, token: string, signal: AbortSignal) { const params = new URLSearchParams({ limit: '25' }); if (cursor)
    params.set('cursor', cursor); const data = readObject(await requestAuthenticatedJson(`/api/v1/trips/${id}/assignments?${params}`, { accessToken: token, signal })); if (!Array.isArray(data.items))
    return invalidResponse(); const items = data.items.map(value => { const row = readObject(value); if (!['active', 'replaced', 'completed', 'cancelled'].includes(String(row.status)))
    return invalidResponse(); return { id: readId(row.id), driverId: readId(row.driverId), status: String(row.status), assignedAt: readTimestamp(row.assignedAt) }; }); return { items, pageInfo: readPage(data.pageInfo, items.length, 25) }; }
export async function tripExpenses(id: string, token: string, signal: AbortSignal) { const data = readObject(await requestAuthenticatedJson(`/api/v1/trips/${id}/expenses`, { accessToken: token, signal })); if (!Array.isArray(data.items))
    return invalidResponse(); const items = data.items.map(value => { const row = readObject(value); if (readId(row.tripId) !== id)
    return invalidResponse(); return { id: readId(row.id), description: readText(row.description), amount: money(row.amount) }; }); const total = money(data.totalExpenseAmount); if (items.reduce((sum, row) => sum + BigInt(row.amount.replace('.', '')), 0n) !== BigInt(total.replace('.', '')))
    return invalidResponse(); return { items, total, confirmed: data.expensesConfirmedAt === null ? null : readTimestamp(data.expensesConfirmedAt) }; }
export function validateTripCommand(value: unknown, input: {
    path: string;
    body: unknown;
}) { const row = readObject(value); const isAssignment = input.path.endsWith('/assignments'); const trip = readTrip(isAssignment ? row.trip : row); const expected = readObject(input.body); if (trip.id !== input.path.split('/')[4])
    return invalidResponse(); if (isAssignment) {
    const assignment = readObject(row.assignment);
    const rawTrip = readObject(row.trip);
    if (readId(assignment.tripId) !== trip.id || readId(assignment.driverId) !== expected.driverId || assignment.assignmentReason !== expected.reason || rawTrip.currentDriverId !== expected.driverId || !['assigned', 'ongoing'].includes(trip.status))
        return invalidResponse();
}
else if (trip.totalAmount !== expected.totalAmount)
    return invalidResponse(); return { id: trip.id }; }
