import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { useAuthStore } from '../../auth';
import { RequestFeedback } from '../../../shared/components/RequestFeedback';
import { listTrips } from '../api/operational-trip-service';
export function TripsPage() {
    const session = useAuthStore(state => state.session);
    const [params, setParams] = useSearchParams();
    const status = params.get('status') ?? '';
    const cursor = params.get('cursor') ?? '';
    const request = new URLSearchParams({ limit: '25' });
    if (status)
        request.set('status', status);
    if (cursor)
        request.set('cursor', cursor);
    const query = useQuery({ queryKey: ['trips', session?.user.email, status, cursor], enabled: !!session, retry: false, queryFn: ({ signal }) => listTrips(request, session!.accessToken, signal), refetchInterval: 15000, refetchIntervalInBackground: false });
    return <><div className="workspace-heading"><div className="admin-page-heading"><h1 id="page-heading">Trips</h1><p>Assign drivers and follow operational progress. Updates every 15 seconds while visible.</p></div><button className="workspace-button" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh trips</button></div><section className="workspace-card"><label className="workspace-field">Trip status<select value={status} onChange={event => setParams(event.target.value ? { status: event.target.value } : {})}><option value="">All statuses</option>{['unassigned', 'assigned', 'ongoing', 'closed'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>{query.isPending ? <p role="status">Loading trips…</p> : query.isError ? <RequestFeedback error={query.error} onRetry={() => void query.refetch()} pending={query.isFetching}/> : query.data && <><p>{query.data.pageInfo.totalCount} trips in this status</p>{query.data.items.length === 0 ? <p>No trips match these filters.</p> : <ul className="workflow-list">{query.data.items.map(row => <li key={row.id}><div><Link to={`/trips/${row.id}`}>{row.pickup} → {row.drop}</Link><p>{row.status} · {new Date(row.scheduledPickupAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p></div><strong>₹{row.totalAmount}</strong></li>)}</ul>}<div className="workspace-actions">{cursor && <button className="workspace-button" onClick={() => setParams(status ? { status } : {})}>First page</button>}{query.data.pageInfo.hasMore && <button className="workspace-button" onClick={() => setParams({ ...Object.fromEntries(params), cursor: query.data.pageInfo.nextCursor! })}>Next page</button>}</div></>}</section></>;
}
