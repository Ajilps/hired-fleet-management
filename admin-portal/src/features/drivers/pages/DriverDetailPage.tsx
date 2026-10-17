import { Link, useParams, useSearchParams } from 'react-router'
import { isUuid } from '../../../shared/api/response-validation'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { useDriver } from '../hooks/use-drivers'
import './drivers.css'

const timestampFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
const birthDateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' })

function safeDriversReturn(value: string | null) {
  if (!value || !/^\/drivers(?:\?|$)/.test(value) || /[\\\r\n#]/.test(value)) return '/drivers'
  return value
}

export function DriverDetailPage() {
  const { driverId = '' } = useParams()
  const [params] = useSearchParams()
  const query = useDriver(driverId)
  const driver = query.data
  const delay = useRetryDelay(query.error)
  return <>
    <Link className="workspace-back" to={safeDriversReturn(params.get('returnTo'))}>← Back to drivers</Link>
    <div className="workspace-heading"><div className="admin-page-heading"><h1 id="page-heading">{driver?.user.fullName ?? 'Driver details'}</h1><p className="workspace-id">{driverId} · {driver?.status === 'pending' ? 'Pending application' : 'Driver profile'}</p></div><button className="workspace-button" type="button" disabled={!isUuid(driverId) || query.isFetching || delay > 0} onClick={() => { void query.refetch() }}>{query.isFetching ? 'Refreshing…' : 'Refresh driver'}</button></div>
    {!isUuid(driverId) ? <p className="workspace-notice workspace-error" role="alert">This record is unavailable.</p> : <>
      {query.isPending && <p role="status">Loading driver…</p>}
      {query.isError && <RequestFeedback error={query.error} pending={query.isFetching} onRetry={() => { void query.refetch() }} />}
      {driver && <>
        {query.isError && <p className="workspace-notice workspace-warning">This driver profile is from the previous successful load and may be stale.</p>}
        <div className="drivers-layout"><section className="workspace-card" aria-labelledby="driver-information"><h2 id="driver-information">Application and contact details</h2><dl className="workspace-definition">
          <div><dt>Full name</dt><dd>{driver.user.fullName}</dd></div><div><dt>Email</dt><dd>{driver.user.email}</dd></div><div><dt>Phone</dt><dd>{driver.user.phone ?? 'Not provided'}</dd></div><div><dt>Date of birth</dt><dd>{driver.dateOfBirth ? <time dateTime={driver.dateOfBirth}>{birthDateFormat.format(new Date(`${driver.dateOfBirth}T00:00:00Z`))}</time> : 'Not provided'}</dd></div><div className="workspace-span"><dt>Home address</dt><dd>{driver.homeAddress || 'Not provided'}</dd></div>
          <div><dt>Applied · IST</dt><dd><time dateTime={driver.createdAt}>{timestampFormat.format(new Date(driver.createdAt))}</time></dd></div><div><dt>Updated · IST</dt><dd><time dateTime={driver.updatedAt}>{timestampFormat.format(new Date(driver.updatedAt))}</time></dd></div>
        </dl></section><section className="workspace-card" aria-labelledby="driver-access"><h2 id="driver-access">Operational access</h2><dl className="workspace-definition">
          <div><dt>Operational status</dt><dd><span className={`workspace-badge ${driver.status === 'active' ? 'drivers-positive' : driver.status === 'pending' ? 'drivers-pending' : ''}`}>{driver.status}</span></dd></div><div><dt>User account</dt><dd>{driver.user.isActive ? 'Enabled' : 'Disabled'}</dd></div><div><dt>Online status</dt><dd>{driver.isOnline ? 'Online' : 'Offline'}</dd></div><div><dt>First activation · IST</dt><dd>{driver.onboardedAt ? <time dateTime={driver.onboardedAt}>{timestampFormat.format(new Date(driver.onboardedAt))}</time> : 'Not recorded'}</dd></div><div className="workspace-span"><dt>Activating admin ID</dt><dd>{driver.activatedByUserId ?? 'Not recorded'}</dd></div>
        </dl><p className="workspace-notice">{driver.status === 'pending' ? 'Pending drivers cannot be assigned trips.' : 'Operational status and account access both determine execution access.'} Online status is separate from calendar availability.</p></section></div>
      </>}
    </>}
  </>
}
