import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { useDriverAvailability } from '../hooks/use-driver-availability'
import { nextDate } from '../validation/driver-calendar'

export function DriverDayAvailability({ driverId, driverName, date, enabled }: { driverId: string; driverName: string; date: string; enabled: boolean }) {
  const to = nextDate(date)
  const query = useDriverAvailability(driverId, date, to ?? '', enabled)
  const delay = useRetryDelay(query.error)
  const entry = query.data?.[0]
  return <div className="drivers-day-availability" aria-label={`${driverName} calendar`}>
    {!to ? <small>Choose a valid calendar date.</small> : <>
      {query.isPending && <small role="status">{enabled ? 'Loading calendar…' : 'Calendar not loaded.'}</small>}
      {query.isError && <RequestFeedback error={query.error} />}
      {query.data && <><span className={`workspace-badge ${entry?.isAvailable ? 'drivers-positive' : ''}`}>{entry ? entry.isAvailable ? 'Available' : 'Unavailable' : 'Not provided'}</span>{entry?.note && <small>Note: {entry.note}</small>}{query.isError && <small>Stale calendar data</small>}</>}
      <button className="workspace-button drivers-day-refresh" type="button" aria-label={`${query.isError ? 'Retry' : 'Refresh'} calendar for ${driverName}`} disabled={!enabled || query.isFetching || delay > 0} onClick={() => { void query.refetch() }}>{query.isFetching ? 'Loading…' : query.isError ? 'Try again' : 'Refresh'}</button>
    </>}
  </div>
}
