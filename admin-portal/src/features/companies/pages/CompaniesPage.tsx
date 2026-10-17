import { Link, useLocation, useSearchParams } from 'react-router'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { useCompanies } from '../hooks/use-companies'
import './companies.css'

export function CompaniesPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const cursor = params.get('cursor') ?? ''
  const search = params.get('search') ?? ''
  const status = ['active', 'inactive'].includes(params.get('status') ?? '') ? params.get('status')! : ''
  const query = useCompanies(cursor)
  const delay = useRetryDelay(query.error)
  const returnTo = location.pathname + location.search
  const rows = query.data?.items.filter((company) => (!status || (status === 'active' ? company.isActive : !company.isActive)) && [company.id, company.displayName, company.legalName, company.contactName, company.contactEmail].some((value) => value.toLocaleLowerCase().includes(search.toLocaleLowerCase()))) ?? []
  function handleFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
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
    <div className="workspace-heading"><div className="admin-page-heading"><h1 id="page-heading">Companies</h1><p>Company profiles, contacts and account status.</p></div><Link className="workspace-button workspace-button-primary" to={`/companies/new?returnTo=${encodeURIComponent(returnTo)}`}>Create company</Link></div>
    <section className="workspace-card" aria-label="Company directory">
      <div className="workspace-fields"><label className="workspace-field">Search current page<input type="search" value={search} onChange={(event) => handleFilter('search', event.target.value)} /></label>
        <label className="workspace-field">Status · current page<select value={status} onChange={(event) => handleFilter('status', event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
      <p className="workspace-muted">Search and status apply to the loaded page. Other pages may contain matches.</p>
      <div className="workspace-actions"><button type="button" className="workspace-button" disabled={query.isFetching || delay > 0} onClick={() => { void query.refetch() }}>{query.isFetching ? 'Refreshing…' : 'Refresh companies'}</button><button type="button" className="workspace-button" onClick={() => { const next = new URLSearchParams(params); next.delete('search'); next.delete('status'); setParams(next) }} disabled={!search && !status}>Clear filters</button></div>
      {query.isPending && <p role="status">Loading companies…</p>}
      {query.isError && <RequestFeedback error={query.error} pending={query.isFetching} onRetry={() => { void query.refetch() }} />}
      {query.data && <>
        {query.isError && <p className="workspace-notice workspace-warning">These company records are from the previous successful load and may be stale.</p>}
        {rows.length === 0 ? <p className="workspace-notice" role="status">{query.data.items.length ? 'No companies match the current-page filters.' : 'No companies on this page. Create a company to get started.'}</p> : <table className="companies-table"><caption>Companies · newest first</caption><thead><tr><th scope="col">Company</th><th scope="col">Contact</th><th scope="col">Status</th><th scope="col">Profile</th></tr></thead><tbody>{rows.map((company) => <tr key={company.id}>
          <td data-label="Company"><strong>{company.displayName}</strong><small>{company.legalName}</small><small>{company.id}</small></td><td data-label="Contact">{company.contactName}<small>{company.contactEmail}</small><small>{company.contactPhone}</small></td>
          <td data-label="Status"><span className={`workspace-badge companies-status-${company.isActive ? 'active' : 'inactive'}`}>{company.isActive ? 'Active' : 'Inactive'}</span></td><td data-label="Profile"><Link to={`/companies/${company.id}?returnTo=${encodeURIComponent(returnTo)}`} aria-label={`View ${company.displayName}`}>View →</Link></td></tr>)}</tbody></table>}
        <div className="companies-pagination"><p className="workspace-muted" role="status">{rows.length} shown from {query.data.items.length} loaded · {query.data.pageInfo.totalCount.toLocaleString('en-IN')} companies in total · Page {params.getAll('previousCursor').length + 1}</p><div className="workspace-actions"><button type="button" className="workspace-button" disabled={query.isFetching || !cursor} onClick={handlePrevious}>← Previous</button><button type="button" className="workspace-button" disabled={query.isFetching || query.isError || !query.data.pageInfo.hasMore || params.getAll('previousCursor').includes(query.data.pageInfo.nextCursor ?? '')} onClick={handleNext}>Next →</button></div></div>
      </>}
    </section>
  </>
}
