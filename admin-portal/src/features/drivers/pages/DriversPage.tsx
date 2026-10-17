import { Link, useLocation, useSearchParams } from 'react-router'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { useDrivers } from '../hooks/use-drivers'
import { driverStatuses } from '../types/driver-types'
import type { DriverStatus } from '../types/driver-types'
import './drivers.css'

export function DriversPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const status = driverStatuses.includes(params.get('status') as DriverStatus) ? params.get('status') as DriverStatus : 'active'
  const online = params.get('online') === 'true' ? 'true' : params.get('online') === 'false' ? 'false' : ''
  const cursor = params.get('cursor') ?? ''
  const search = params.get('search') ?? ''
  const query = useDrivers({ status, online, cursor })
  const delay = useRetryDelay(query.error)
  const returnTo = location.pathname + location.search
  const rows = query.data?.items.filter((driver) => [driver.user.fullName, driver.user.email, driver.user.phone ?? '', driver.id].some((value) => value.toLocaleLowerCase().includes(search.toLocaleLowerCase()))) ?? []

  function handleFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'search') { next.delete('cursor'); next.delete('previousCursor') }
    setParams(next, { replace: key === 'search' })
  }
  function handleNext() {
    const nextCursor = query.data?.pageInfo.nextCursor
    if (!nextCursor) return
    const next = new URLSearchParams(params)
    next.append('previousCursor', cursor)
    next.set('cursor', nextCursor)
    setParams(next)
  }
  function handlePrevious() {
    const previous = params.getAll('previousCursor')
    const previousCursor = previous.pop()
    const next = new URLSearchParams(params)
    next.delete('previousCursor')
    previous.forEach((value) => next.append('previousCursor', value))
    if (previousCursor) next.set('cursor', previousCursor)
    else next.delete('cursor')
    setParams(next)
  }

  return <>
    <div className="workspace-heading"><div className="admin-page-heading"><h1 id="page-heading">Drivers</h1><p>Review applications and operational driver profiles.</p></div></div>
    <section className="workspace-card" aria-labelledby="driver-directory-heading">
      <h2 id="driver-directory-heading">Driver directory</h2>
      <div className="drivers-status-filters" role="group" aria-label="Driver status">{driverStatuses.map((value) => <button key={value} className={`workspace-button ${status === value ? 'workspace-button-primary' : ''}`} type="button" aria-pressed={status === value} onClick={() => handleFilter('status', value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      <div className="workspace-fields"><label className="workspace-field">Search current page<input type="search" value={search} onChange={(event) => handleFilter('search', event.target.value)} /></label>
        <label className="workspace-field">Online status<select value={online} onChange={(event) => handleFilter('online', event.target.value)}><option value="">All online statuses</option><option value="true">Online</option><option value="false">Offline</option></select></label></div>
      <p className="workspace-muted">Status and online filters apply across the directory. Search applies only to this page.</p>
      <div className="workspace-actions"><button className="workspace-button" type="button" disabled={query.isFetching || delay > 0} onClick={() => { void query.refetch() }}>{query.isFetching ? 'Refreshing…' : 'Refresh drivers'}</button><button className="workspace-button" type="button" disabled={!search && !online} onClick={() => { const next = new URLSearchParams(params); next.delete('search'); next.delete('online'); if (online) { next.delete('cursor'); next.delete('previousCursor') } setParams(next) }}>Clear filters</button></div>
      {query.isPending && <p role="status">Loading drivers…</p>}
      {query.isError && <RequestFeedback error={query.error} pending={query.isFetching} onRetry={() => { void query.refetch() }} />}
      {query.data && <>
        {query.isError && <p className="workspace-notice workspace-warning">These driver records are from the previous successful load and may be stale.</p>}
        {rows.length === 0 ? <p className="workspace-notice" role="status">{query.data.items.length ? 'No drivers match the current-page search.' : 'No drivers on this page for the selected filters.'}</p> : <table className="drivers-table"><caption>{status[0].toUpperCase() + status.slice(1)} drivers · newest first</caption><thead><tr><th scope="col">Driver</th><th scope="col">Contact</th><th scope="col">Account</th><th scope="col">Online status</th><th scope="col">Profile</th></tr></thead><tbody>{rows.map((driver) => <tr key={driver.id}>
          <td data-label="Driver"><strong>{driver.user.fullName}</strong><small>{driver.id}</small></td><td data-label="Contact">{driver.user.phone ?? 'Phone not provided'}<small>{driver.user.email}</small></td><td data-label="Account"><span className={`workspace-badge ${driver.user.isActive ? 'drivers-positive' : ''}`}>{driver.user.isActive ? 'Enabled' : 'Disabled'}</span></td><td data-label="Online status"><span className={`workspace-badge ${driver.isOnline ? 'drivers-positive' : ''}`}>{driver.isOnline ? 'Online' : 'Offline'}</span></td><td data-label="Profile"><Link to={`/drivers/${driver.id}?returnTo=${encodeURIComponent(returnTo)}`} aria-label={`View ${driver.user.fullName}`}>{status === 'pending' ? 'Review →' : 'View →'}</Link></td>
        </tr>)}</tbody></table>}
        <div className="drivers-pagination"><p className="workspace-muted" role="status">{rows.length} shown from {query.data.items.length} loaded · {query.data.pageInfo.totalCount.toLocaleString('en-IN')} drivers matching server filters · Page {params.getAll('previousCursor').length + 1}</p><div className="workspace-actions"><button className="workspace-button" type="button" disabled={query.isFetching || !cursor} onClick={handlePrevious}>← Previous</button><button className="workspace-button" type="button" disabled={query.isFetching || query.isError || !query.data.pageInfo.hasMore || params.getAll('previousCursor').includes(query.data.pageInfo.nextCursor ?? '')} onClick={handleNext}>Next →</button></div></div>
      </>}
      <p className="workspace-muted drivers-footnote">Operational activation, account access and online status are separate. Pending drivers cannot be assigned. Online status does not establish calendar availability or connectivity.</p>
    </section>
  </>
}
