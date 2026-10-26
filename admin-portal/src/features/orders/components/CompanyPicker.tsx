import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useCompanyOptions } from '../hooks/use-orders'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'

export function CompanyPicker({ value, onChange, activeOnly = false, disabled = false, required = false }: { value: string; onChange: (value: string) => void; activeOnly?: boolean; disabled?: boolean; required?: boolean }) {
  const query = useCompanyOptions()
  const delay = useRetryDelay(query.error)
  const companies = query.data?.pages.flatMap((page) => page.items) ?? []
  const unique = companies.filter((company, index) => companies.findIndex((entry) => entry.id === company.id) === index)
  return <div>
    <label className="workspace-field">Company{required ? ' *' : ''}<select name="companyId" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled || query.isPending} required={required}>
      <option value="">{query.isPending ? 'Loading companies…' : activeOnly ? 'Choose an active company' : 'All companies'}</option>
      {value && !unique.some((company) => company.id === value) && <option value={value}>{value}</option>}
      {unique.map((company) => <option key={company.id} value={company.id} disabled={activeOnly && !company.isActive}>{company.displayName}{company.isActive ? '' : ' (inactive)'}</option>)}
    </select></label>
    {query.isError && <RequestFeedback error={query.error} onRetry={() => { void query.refetch() }} pending={query.isFetching} />}
    {query.hasNextPage && <button className="workspace-button" type="button" disabled={disabled || query.isFetching || delay > 0} onClick={() => { void query.fetchNextPage() }}>Load more companies</button>}
    {activeOnly && query.isSuccess && !unique.some((company) => company.isActive) && <p className="workspace-muted">No active companies on the loaded pages. Load more companies if available.</p>}
  </div>
}
