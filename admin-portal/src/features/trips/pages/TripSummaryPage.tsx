import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { useAuthStore } from '../../auth'
import { isUuid } from '../../../shared/api/response-validation'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { getTrip } from '../api/trip-service'

export function TripSummaryPage() {
  const { tripId = '' } = useParams()
  const session = useAuthStore((state) => state.session)
  const query = useQuery({ queryKey: ['trips', session?.user.email, tripId], enabled: Boolean(session) && isUuid(tripId), queryFn: ({ signal }) => getTrip(tripId, session!.accessToken, signal), retry: false, networkMode: 'always' })
  const trip = query.data
  return <>
    <Link className="workspace-back" to="/trips">← All trips</Link>
    <div className="admin-page-heading"><h1 id="page-heading">Trip summary</h1><p>Acceptance creates a trip. Driver assignment is a separate step.</p></div>
    {!isUuid(tripId) ? <p role="alert">This trip link is invalid.</p> : query.isPending ? <p role="status">Loading trip…</p> : query.isError ? <RequestFeedback error={query.error} onRetry={() => { void query.refetch() }} pending={query.isFetching} /> : trip && <section className="workspace-card" aria-labelledby="trip-summary-heading">
      <h2 id="trip-summary-heading" className="workspace-id">{trip.id}</h2>
      <span className={`workspace-badge workspace-badge-${trip.status}`}>{trip.status}</span>
      <dl className="workspace-definition" style={{ marginTop: 24 }}>
        <div><dt>Pickup</dt><dd>{trip.pickup}</dd></div><div><dt>Destination</dt><dd>{trip.drop}</dd></div>
        <div><dt>Scheduled pickup · IST</dt><dd>{new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(trip.scheduledPickupAt))}</dd></div>
        <div><dt>Trip amount · INR</dt><dd>₹{trip.totalAmount}</dd></div>
      </dl><p className="workspace-muted">Assignment controls will be available with the Trips and assignment workflow.</p>
      <Link className="workspace-button" to={`/orders/${trip.orderId}`}>View accepted order</Link>
    </section>}
  </>
}
