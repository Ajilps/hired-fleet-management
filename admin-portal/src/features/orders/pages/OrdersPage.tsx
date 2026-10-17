import { Link, useLocation, useSearchParams } from 'react-router'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { OrderFiltersForm } from '../components/OrderFiltersForm'
import { useCompanyOptions, useOrders } from '../hooks/use-orders'
import { sourceLabels } from '../types/order-types'
import type { OrderFilters } from '../types/order-types'
import { filtersFromParams, validateFilters } from '../validation/order-validation'
import './orders.css'

const pickupDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })

export function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const filters = filtersFromParams(params)
  const invalid = validateFilters(filters)
  const query = useOrders(filters)
  const companies = useCompanyOptions()
  const delay = useRetryDelay(query.error)
  const names = new Map(companies.data?.pages.flatMap((page) => page.items.map((company) => [company.id, company.displayName] as const)))
  const rows = query.data?.items.filter((order) => {
    const haystack = `${order.id} ${names.get(order.companyId) ?? order.companyId} ${order.pickup} ${order.drop}`.toLowerCase()
    return (!filters.source || order.source === filters.source) && haystack.includes(filters.search.trim().toLowerCase())
  }) ?? []
  const returnTo = `${location.pathname}${location.search}`

  function handleApply(next: OrderFilters) {
    const updated = new URLSearchParams(params)
    const serverChanged = (['status', 'companyId', 'from', 'to'] as const).some((key) => next[key] !== filters[key])
    if (serverChanged) { updated.delete('cursor'); updated.delete('previousCursor') }
    for (const [key, value] of Object.entries(next)) {
      if (key === 'cursor') continue
      if (value) updated.set(key, value); else updated.delete(key)
    }
    setParams(updated)
  }
  function handleNext() {
    if (!query.data?.pageInfo.nextCursor || query.data.pageInfo.nextCursor === filters.cursor) return
    const next = new URLSearchParams(params)
    next.append('previousCursor', filters.cursor)
    next.set('cursor', query.data.pageInfo.nextCursor)
    setParams(next)
  }
  function handlePrevious() {
    const next = new URLSearchParams(params)
    const previous = next.getAll('previousCursor')
    const cursor = previous.pop() ?? ''
    next.delete('previousCursor')
    previous.forEach((value) => next.append('previousCursor', value))
    if (cursor) next.set('cursor', cursor); else next.delete('cursor')
    setParams(next)
  }
  return <>
    <div className="workspace-heading"><div className="admin-page-heading"><h1 id="page-heading">Orders</h1><p>Review incoming requests and record each decision.</p></div><Link className="workspace-button workspace-button-primary" to={`/orders/new?returnTo=${encodeURIComponent(returnTo)}`}>Create order</Link></div>
    <section className="workspace-card" aria-labelledby="order-inbox-heading"><h2 id="order-inbox-heading">Order inbox</h2>
      <OrderFiltersForm key={params.toString()} filters={filters} onApply={handleApply} onClear={() => setParams({})} />
      {invalid ? <p className="workspace-notice workspace-error" role="alert">{invalid}</p> : <>
        <div className="workspace-actions"><button className="workspace-button" disabled={query.isFetching || delay > 0} type="button" onClick={() => { void query.refetch() }}>{query.isFetching ? 'Refreshing…' : 'Refresh orders'}</button></div>
        {query.isPending && <p role="status">Loading orders…</p>}
        {query.isError && <RequestFeedback error={query.error} onRetry={() => { void query.refetch() }} pending={query.isFetching} />}
        {query.data && <>
          {query.isError && <p className="workspace-notice workspace-warning">These rows are from the previous successful load and may be stale.</p>}
          {rows.length === 0 ? <p className="workspace-notice" role="status">{query.data.items.length ? 'No orders match the current-page search/source filters. Other pages may contain matches.' : 'No orders match these filters.'}</p> : <table className="orders-table"><caption className="workspace-muted" style={{ textAlign: 'left', padding: '20px 0 12px' }}>Orders · creation order, newest first</caption>
            <thead><tr><th scope="col">Order</th><th scope="col">Company / route</th><th scope="col">Pickup · IST</th><th scope="col">Source</th><th scope="col">Status</th></tr></thead>
            <tbody>{rows.map((order) => <tr key={order.id}><td data-label="Order"><Link to={`/orders/${order.id}?returnTo=${encodeURIComponent(returnTo)}`}>{order.id}</Link></td>
              <td data-label="Company / route">{names.get(order.companyId) ?? order.companyId}<small>{order.pickup} → {order.drop}</small></td>
              <td data-label="Pickup · IST"><time dateTime={order.requestedPickupAt}>{pickupDate.format(new Date(order.requestedPickupAt))}</time></td>
              <td data-label="Source">{sourceLabels[order.source]}</td><td data-label="Status"><span className={`workspace-badge workspace-badge-${order.status}`}>{order.status}</span></td></tr>)}</tbody>
          </table>}
          <div className="orders-pagination"><p className="workspace-muted" role="status">{rows.length} shown from {query.data.items.length} loaded · {query.data.pageInfo.totalCount.toLocaleString('en-IN')} server results · Page {params.getAll('previousCursor').length + 1}</p>
            <div className="workspace-actions"><button className="workspace-button" disabled={query.isFetching || !filters.cursor} onClick={handlePrevious} type="button">← Previous</button><button className="workspace-button" disabled={query.isFetching || !query.data.pageInfo.hasMore || query.data.pageInfo.nextCursor === filters.cursor || query.isError} onClick={handleNext} type="button">Next →</button></div>
          </div>
        </>}
      </>}
    </section>
  </>
}
