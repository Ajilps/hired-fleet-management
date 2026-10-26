import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { useAuthStore } from '../../auth';
import { useWorkflowCommand } from '../../workflows';
import { isUuid } from '../../../shared/api/response-validation';
import { RequestFeedback } from '../../../shared/components/RequestFeedback';
import { operationalTrip, activeDrivers, tripHistory, tripExpenses, validateTripCommand } from '../api/operational-trip-service';
function TripContent({ tripId }: {
    tripId: string;
}) {
    const session = useAuthStore(state => state.session);
    const [driverId, setDriverId] = useState('');
    const [reason, setReason] = useState('');
    const [search, setSearch] = useState('');
    const [amount, setAmount] = useState('');
    const [amountReason, setAmountReason] = useState('');
    const [saved, setSaved] = useState('');
    const command = useWorkflowCommand(validateTripCommand);
    const query = useQuery({ queryKey: ['trip-detail', session?.user.email, tripId], enabled: !!session && isUuid(tripId), retry: false, queryFn: ({ signal }) => operationalTrip(tripId, session!.accessToken, signal), refetchOnWindowFocus: false });
    const detail = query.data;
    const trip = detail?.trip;
    const drivers = useInfiniteQuery({ queryKey: ['assignable-drivers', session?.user.email], enabled: !!session && !!trip && trip.status !== 'closed', initialPageParam: '', retry: false, queryFn: ({ pageParam, signal }) => activeDrivers(pageParam, session!.accessToken, signal), getNextPageParam: (page, pages) => page.pageInfo.hasMore && !pages.some(previous => previous !== page && previous.pageInfo.nextCursor === page.pageInfo.nextCursor) ? page.pageInfo.nextCursor ?? undefined : undefined });
    const history = useInfiniteQuery({ queryKey: ['trip-history', session?.user.email, tripId], enabled: !!session && !!trip, initialPageParam: '', retry: false, queryFn: ({ pageParam, signal }) => tripHistory(tripId, pageParam, session!.accessToken, signal), getNextPageParam: (page, pages) => page.pageInfo.hasMore && !pages.some(previous => previous !== page && previous.pageInfo.nextCursor === page.pageInfo.nextCursor) ? page.pageInfo.nextCursor ?? undefined : undefined });
    const expenses = useQuery({ queryKey: ['trip-expenses', session?.user.email, tripId], enabled: !!session && !!trip, retry: false, queryFn: ({ signal }) => tripExpenses(tripId, session!.accessToken, signal) });
    const locked = command.isPending || command.uncertain || query.isFetching || query.isError || command.conflict || command.delay > 0 || !detail?.etag;
    const candidates = drivers.data?.pages.flatMap(page => page.items).filter((row, index, rows) => row.eligible && rows.findIndex(other => other.id === row.id) === index && row.id !== detail?.driver?.id && `${row.name} ${row.phone ?? ''}`.toLowerCase().includes(search.toLowerCase())) ?? [];
    async function handleAssign(event: React.SubmitEvent<HTMLFormElement>) { event.preventDefault(); if (locked || !driverId || !reason.trim())
        return; const result = await command.run({ path: `/api/v1/trips/${tripId}/assignments`, etag: detail!.etag!, body: { driverId, reason: reason.trim() } }); if (result) {
        setSaved('Driver assignment saved.');
        setReason('');
        setDriverId('');
        await query.refetch();
    } }
    async function handleAmount(event: React.SubmitEvent<HTMLFormElement>) { event.preventDefault(); if (locked || !amountReason.trim() || !/^(?:0|[1-9]\d{0,9})\.\d{2}$/.test(amount))
        return; const result = await command.run({ path: `/api/v1/trips/${tripId}/amount`, method: 'PATCH', etag: detail!.etag!, body: { totalAmount: amount, reason: amountReason.trim() } }); if (result) {
        setSaved('Trip amount saved.');
        setAmount('');
        setAmountReason('');
        await query.refetch();
    } }
    return <><Link className="workspace-back" to="/trips">← All trips</Link><div className="workspace-heading"><div className="admin-page-heading"><h1 id="page-heading">Trip summary</h1><p>Acceptance creates a trip. Driver assignment is a separate step.</p></div><button className="workspace-button" disabled={query.isFetching || command.isPending || command.uncertain || command.delay > 0} onClick={async () => { await query.refetch(); command.clear(); }}>Refresh trip</button></div>
 {!isUuid(tripId) ? <p role="alert">This trip link is invalid.</p> : query.isPending ? <p role="status">Loading trip…</p> : <>{query.isError && <RequestFeedback error={query.error}/>} {saved && <p className="workspace-notice workspace-success" role="status">{saved}</p>}{command.error && <RequestFeedback error={command.error}/>} {command.uncertain && <div className="workspace-notice workspace-warning"><p>The response was interrupted. Inputs remain locked until the same command is confirmed.</p><button className="workspace-button" disabled={command.isPending || command.delay > 0} onClick={async () => { if (await command.retry()) {
            setSaved('The saved command is confirmed.');
            setDriverId('');
            setReason('');
            setAmount('');
            setAmountReason('');
            await query.refetch();
        } }}>Retry same command</button></div>}{command.conflict && <p className="workspace-notice workspace-warning">Refresh the trip and review its current state before a new command.</p>}{trip && <><section className="workspace-card"><h2 className="workspace-id">{trip.id}</h2><span className={`workspace-badge workspace-badge-${trip.status}`}>{trip.status}</span><dl className="workspace-definition" style={{ marginTop: 24 }}><div><dt>Pickup</dt><dd>{trip.pickup}</dd></div><div><dt>Destination</dt><dd>{trip.drop}</dd></div><div><dt>Scheduled pickup · IST</dt><dd>{new Date(trip.scheduledPickupAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</dd></div><div><dt>Trip amount · INR</dt><dd>₹{trip.totalAmount}</dd></div><div><dt>Current driver</dt><dd>{detail?.driver ? <Link to={`/drivers/${detail.driver.id}`}>{detail.driver.name} · {detail.driver.phone ?? 'No phone supplied'}</Link> : 'Unassigned'}</dd></div><div><dt>Execution</dt><dd>{detail?.startedAt ? `Started ${new Date(detail.startedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST` : 'Not started'}{detail?.closedAt && ` · Closed ${new Date(detail.closedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`}</dd></div></dl><div className="workspace-actions"><Link className="workspace-button" to={`/orders/${trip.orderId}`}>View accepted order</Link></div></section>
 {trip.status !== 'closed' && <div className="workflow-grid"><section className="workspace-card"><h2>{detail?.driver ? 'Reassign driver' : 'Assign driver'}</h2>{trip.status === 'ongoing' && <p className="workspace-notice workspace-warning">This trip is ongoing. Reassignment preserves its start and expenses, clears expense confirmation, and transfers access and the full eventual driver payout to the replacement driver.</p>}<p className="workspace-muted">Review the driver’s availability before assigning. Online status does not reserve time or rule out overlapping trips.</p>{drivers.isError && <RequestFeedback error={drivers.error} onRetry={() => void drivers.refetch()}/>}<form onSubmit={event => void handleAssign(event)}><fieldset disabled={locked}><label className="workspace-field">Search loaded drivers<input value={search} onChange={event => setSearch(event.target.value)}/></label><label className="workspace-field">Active driver<select required value={driverId} onChange={event => setDriverId(event.target.value)}><option value="">Choose an active driver</option>{candidates.map(row => <option key={row.id} value={row.id}>{row.name} · {row.online ? 'online' : 'offline'} · {row.phone ?? 'no phone'}</option>)}</select></label>{!drivers.isPending && candidates.length === 0 && <p>No eligible drivers on the loaded pages.</p>}{drivers.hasNextPage && <button className="workspace-button" type="button" disabled={drivers.isFetching} onClick={() => void drivers.fetchNextPage()}>Load more drivers</button>}<label className="workspace-field">Assignment reason<textarea required maxLength={250} value={reason} onChange={event => setReason(event.target.value)}/></label><button className="workspace-button workspace-button-primary" disabled={!driverId || !reason.trim()} type="submit">Confirm driver assignment</button></fieldset></form></section><section className="workspace-card"><h2>Trip amount</h2><p className="workspace-muted">The final saved amount is used at closure. Expenses stay separate.</p><form onSubmit={event => void handleAmount(event)}><fieldset disabled={locked}><label className="workspace-field">New amount · INR<input required inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,9})\.[0-9]{2}" placeholder={trip.totalAmount} value={amount} onChange={event => setAmount(event.target.value)}/></label><label className="workspace-field">Amount change reason<textarea required maxLength={500} value={amountReason} onChange={event => setAmountReason(event.target.value)}/></label><button className="workspace-button" type="submit">Save trip amount</button></fieldset></form></section></div>}
 <div className="workflow-grid"><section className="workspace-card"><h2>Assignment history</h2>{history.isPending ? <p>Loading history…</p> : history.isError ? <RequestFeedback error={history.error} onRetry={() => void history.refetch()}/> : <><ul className="workflow-list">{history.data?.pages.flatMap(page => page.items).map(row => <li key={row.id}><Link to={`/drivers/${row.driverId}`}>Driver {row.driverId.slice(0, 8)}</Link><span>{row.status} · {new Date(row.assignedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span></li>)}</ul>{history.hasNextPage && <button className="workspace-button" disabled={history.isFetching} onClick={() => void history.fetchNextPage()}>Load more history</button>}</>}</section><section className="workspace-card"><h2>Expenses</h2>{expenses.isPending ? <p>Loading expenses…</p> : expenses.isError ? <RequestFeedback error={expenses.error} onRetry={() => void expenses.refetch()}/> : expenses.data && <><p>₹{expenses.data.total} · {expenses.data.confirmed ? 'Confirmed by the current driver' : 'Awaiting current-driver confirmation'}</p><ul className="workflow-list">{expenses.data.items.map(row => <li key={row.id}><span>{row.description}</span><strong>₹{row.amount}</strong></li>)}</ul><p className="workspace-muted">Recorded separately from commission. Closed trip finances are read-only.</p></>}</section></div></>}</>}
 </>;
}
export function TripSummaryPage() { const { tripId = '' } = useParams(); return <TripContent key={tripId} tripId={tripId}/>; }
