import type { Prisma, Trip } from '../../generated/prisma/client.ts';
import type { CommandActor } from '../commands/command-types.ts';
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts';
import { createCompanyRepository } from '../companies/company-repository.ts';
import { tripDto } from '../orders/order-mapper.ts';
import { HttpError } from '../../shared/http/http-error.ts';
export async function tripScope(tx: WorkflowTransaction, actor: CommandActor): Promise<Prisma.TripWhereInput> {
    if (actor.role === 'partner')
        return { companyId: actor.companyId! };
    if (actor.role === 'driver') {
        const profile = await tx.driver.findUnique({ where: { id: actor.driverId! } });
        return { OR: [{ payroll: { driverId: actor.driverId! }, status: 'closed' }, ...(profile?.status === 'Active' ? [{ currentDriverId: actor.driverId!, status: { not: 'closed' } }] : [])] };
    }
    return {};
}
export async function getTrip(tx: WorkflowTransaction, actor: CommandActor, id: string) {
    const row = await tx.trip.findFirst({ where: { AND: [{ id }, await tripScope(tx, actor)] } });
    if (!row)
        throw new HttpError(404, 'NOT_FOUND', 'Trip not found.');
    return row;
}
export async function lockTrip(tx: WorkflowTransaction, actor: CommandActor, id: string) {
    const before = await getTrip(tx, actor, id);
    await createCompanyRepository(tx).lock(before.companyId);
    await tx.$queryRaw `SELECT id FROM trips WHERE id=${id}::uuid FOR UPDATE`;
    return getTrip(tx, actor, id);
}
export async function projectTrip(tx: WorkflowTransaction, row: Trip) {
    const driver = row.currentDriverId ? await tx.driver.findUnique({ where: { id: row.currentDriverId }, include: { user: true } }) : null;
    return { ...tripDto(row), currentDriver: driver ? { id: driver.id, fullName: driver.user.fullName, phone: driver.user.phone } : null };
}
export function ownDriver(actor: CommandActor, row: Trip) { if (actor.role !== 'driver' || row.currentDriverId !== actor.driverId)
    throw new HttpError(404, 'NOT_FOUND', 'Trip not found.'); }
export function ongoing(row: Trip) { if (row.status !== 'ongoing')
    throw new HttpError(409, 'TRIP_STATE_CONFLICT', 'This action requires an ongoing trip.'); }
export const time = async (tx: WorkflowTransaction) => (await tx.$queryRaw<{
    now: Date;
}[]> `SELECT date_trunc('milliseconds',clock_timestamp()) AS now`)[0]!.now;
