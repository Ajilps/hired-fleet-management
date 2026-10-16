import { Link } from 'react-router'
import { useOperationsOverview } from '../hooks/use-operations-overview'
import type { OverviewRecord } from '../types/overview-types'
import './operations-overview.css'

const dateTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const month = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' })

function UpdatedAt({ timestamp }: { timestamp: number }) {
  return <time dateTime={new Date(timestamp).toISOString()}>{dateTime.format(timestamp)} IST</time>
}

function RecordSummary({ record }: { record: OverviewRecord }) {
  return <>
    <strong className="overview-record-id">{record.id}</strong>
    <span className="overview-record-company">Company {record.companyId}</span>
    {record.route && <span>{record.route}</span>}
    {record.pickupAt && <time dateTime={record.pickupAt}>{dateTime.format(new Date(record.pickupAt))} IST</time>}
    {record.periodStart && <span>{month.format(new Date(`${record.periodStart}T00:00:00+05:30`))} statement</span>}
  </>
}

export function OperationsOverviewPage() {
  const { sections, isRefreshing, refresh } = useOperationsOverview()
  const failed = sections.filter(({ query }) => query.isError)
  const stale = sections.some(({ query }) => query.data && (query.isStale || query.isError))
  const updates = sections.filter(({ query }) => query.data).map(({ query }) => query.dataUpdatedAt)
  const empty = !isRefreshing && sections.every(({ query }) => query.data?.totalCount === 0 && !query.isError && !query.isStale)

  return (
    <div className="operations-overview">
      <div className="overview-heading-row">
        <div className="admin-page-heading"><h1 id="page-heading">Operations overview</h1><p>Orders, trips and approvals at a glance.</p><Link className="overview-button" style={{ marginTop: 16 }} to="/orders/new">Create order</Link></div>
        <button className="overview-button" type="button" disabled={isRefreshing} onClick={() => { void refresh() }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></svg>
          {isRefreshing ? 'Refreshing…' : failed.length ? 'Retry refresh' : 'Refresh overview'}
        </button>
      </div>
      <p className="overview-refresh-status" role="status">
        All companies · All dates · {isRefreshing ? 'Updating summaries…' : updates.length ? <>Oldest summary update: <UpdatedAt timestamp={Math.min(...updates)} /></> : 'No summaries loaded yet.'}
      </p>
      {failed.length > 0 && <div className="overview-notice overview-notice-warning" role="alert">
        <strong>{failed.length === sections.length ? 'Unable to refresh operations.' : 'Some summaries could not be refreshed.'}</strong>
        <span>{failed.map(({ config }) => config.label).join(', ')}. {failed.some(({ query }) => query.data) ? 'Previously loaded values are marked stale.' : 'Use Retry refresh to try again.'} {failed.length < sections.length && 'Other summaries remain available.'}</span>
      </div>}
      {stale && !isRefreshing && failed.length === 0 && <p className="overview-notice overview-notice-warning">Some summaries are over a minute old. Refresh for the latest operations.</p>}

      <div className="overview-metrics" aria-label="Operational counts">
        {sections.map(({ config, query }) => <section className="overview-metric" key={config.key} aria-labelledby={`metric-${config.key}`} aria-busy={query.isFetching}>
          <h2 id={`metric-${config.key}`}>{config.label}</h2>
          <p className={`overview-metric-value${!query.data ? ' overview-metric-unavailable' : ''}`}>
            {query.data ? query.data.totalCount.toLocaleString('en-IN') : query.isPending ? 'Loading…' : 'Unavailable'}
          </p>
          <p>{config.description}</p>
          {query.data && <span className={`overview-freshness${query.isError || query.isStale ? ' is-stale' : ''}`}>
            {query.isError || query.isStale ? 'Stale · ' : 'Updated · '}<UpdatedAt timestamp={query.dataUpdatedAt} />
          </span>}
        </section>)}
      </div>

      {empty && <div className="overview-notice overview-notice-success" role="status"><strong>All caught up</strong><span>No orders awaiting decision, ongoing or unassigned trips, or statements awaiting approval.</span></div>}

      <div className="overview-detail-grid">
        {sections.map(({ config, query }) => <section className={`overview-panel overview-panel-${config.key}`} key={config.key} aria-labelledby={`list-${config.key}`} aria-busy={query.isFetching}>
          <div className="overview-panel-heading"><h2 id={`list-${config.key}`}>{config.listTitle}</h2>
            <span className={`overview-badge overview-badge-${config.key}`}>{config.badge}</span>
          </div>
          {query.data ? query.data.totalCount === 0 ? <p className="overview-empty">{config.emptyMessage}</p> : <>
            {(config.key === 'unassigned' || config.key === 'statements') && <div className={`overview-attention overview-attention-${config.key}`}>
              <strong>{query.data.totalCount.toLocaleString('en-IN')} {config.key === 'unassigned' ? query.data.totalCount === 1 ? 'trip needs a driver' : 'trips need a driver' : query.data.totalCount === 1 ? 'statement awaits approval' : 'statements await approval'}</strong>
              <p>{config.key === 'unassigned' ? 'Accepted trips are ready for driver assignment.' : 'Each statement requires its creator’s approval and a distinct second admin’s approval.'}</p>
            </div>}
            <ul className="overview-records">{query.data.items.map((record) => <li key={record.id}><RecordSummary record={record} />{config.key !== 'statements' && <Link className="overview-button" to={`${config.path}/${record.id}`}>{config.key === 'orders' ? 'Review order' : 'View trip'}</Link>}</li>)}</ul>
            <p className="overview-list-note">Showing {query.data.items.length} of {query.data.totalCount.toLocaleString('en-IN')} · {query.isError || query.isStale ? 'Stale summary' : 'Latest loaded summary'}</p>
          </> : <p className="overview-empty">{query.isPending ? 'Loading summary…' : 'Summary unavailable. Retry refresh to try again.'}</p>}
          <Link className="overview-button overview-section-link" to={config.path}>{config.linkLabel}<span aria-hidden="true">→</span></Link>
        </section>)}
      </div>
    </div>
  )
}
