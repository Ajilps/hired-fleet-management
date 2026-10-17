import { useState } from 'react'
import type { FormEvent } from 'react'
import { CompanyPicker } from './CompanyPicker'
import { orderSources, orderStatuses, sourceLabels } from '../types/order-types'
import type { OrderFilters } from '../types/order-types'

export function OrderFiltersForm({ filters, onApply, onClear }: { filters: OrderFilters; onApply: (next: OrderFilters) => void; onClear: () => void }) {
  const [draft, setDraft] = useState(filters)
  function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onApply(draft) }
  return <form aria-label="Order filters" onSubmit={handleSubmit}>
    <div className="orders-filter-grid">
      <label className="workspace-field">Search current page<input type="search" value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} placeholder="Order ID, company or route" maxLength={200} /></label>
      <CompanyPicker value={draft.companyId} onChange={(companyId) => setDraft({ ...draft, companyId })} />
      <label className="workspace-field">Source · current page<select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })}><option value="">All sources</option>{orderSources.map((source) => <option key={source} value={source}>{sourceLabels[source]}</option>)}</select></label>
      <label className="workspace-field">Created from · IST<input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
      <label className="workspace-field">Created through · IST<input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
      <label className="workspace-field">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="">All statuses</option>{orderStatuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
    </div>
    <p className="workspace-muted">Search and source filter only the loaded page. Company, status and creation dates filter all results. Dates include the selected end day in IST.</p>
    <div className="workspace-actions"><button className="workspace-button workspace-button-primary" type="submit">Apply filters</button><button className="workspace-button" type="button" onClick={onClear}>Clear filters</button></div>
  </form>
}
