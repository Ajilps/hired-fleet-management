import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { isUuid } from '../../../shared/api/response-validation'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { useCompany, useCompanyRates } from '../hooks/use-companies'
import { safeCompaniesReturn } from '../validation/company-validation'
import { CompanyPartners } from '../components/CompanyPartners'
import './companies.css'

const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
export function CompanyDetailPage() {
  const { companyId = '' } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const returnTo = safeCompaniesReturn(params.get('returnTo'))
  const query = useCompany(companyId)
  const company = query.data
  const rates = useCompanyRates(companyId, Boolean(company))
  const delay = useRetryDelay(query.error)
  const rateDelay = useRetryDelay(rates.error)
  const openRates = rates.data?.pages.flatMap((page) => page.items).filter((rate) => rate.effectiveTo === null) ?? []
  const currentRate = openRates.length === 1 ? openRates[0] : null
  const hasSaved = location.state?.savedCompanyId === companyId
  return <>
    <Link className="workspace-back" to={returnTo}>← Back to companies</Link>
    <div className="workspace-heading"><div className="admin-page-heading"><h1 id="page-heading">{company?.displayName ?? 'Company details'}</h1><p className="workspace-id">{companyId} · Company profile</p></div><button className="workspace-button" type="button" disabled={!isUuid(companyId) || query.isFetching || delay > 0} onClick={() => { void query.refetch() }}>{query.isFetching ? 'Refreshing…' : 'Refresh company'}</button></div>
    {!isUuid(companyId) ? <p className="workspace-notice workspace-error" role="alert">This record is unavailable.</p> : <>
      {hasSaved && <p className="workspace-notice workspace-success" role="status">Company and initial payout split saved. Partner accounts can be provisioned separately.</p>}
      {query.isPending && <p role="status">Loading company…</p>}
      {query.isError && <RequestFeedback error={query.error} onRetry={() => { void query.refetch() }} pending={query.isFetching} />}
      {company && <>
        {query.isError && <p className="workspace-notice workspace-warning">This company profile is from the previous successful load and may be stale.</p>}
        <div className="companies-layout"><section className="workspace-card" aria-labelledby="company-information"><h2 id="company-information">Company information</h2><dl className="workspace-definition">
          <div><dt>Legal company name</dt><dd>{company.legalName}</dd></div><div><dt>Display name</dt><dd>{company.displayName}</dd></div><div><dt>Status</dt><dd><span className={`workspace-badge companies-status-${company.isActive ? 'active' : 'inactive'}`}>{company.isActive ? 'Active' : 'Inactive'}</span></dd></div>
          <div><dt>Contact name</dt><dd>{company.contactName}</dd></div><div><dt>Contact email</dt><dd>{company.contactEmail}</dd></div><div><dt>Contact phone</dt><dd>{company.contactPhone}</dd></div><div className="workspace-span"><dt>Billing address</dt><dd>{company.billingAddress}</dd></div>
          <div><dt>Created · IST</dt><dd><time dateTime={company.createdAt}>{dateFormat.format(new Date(company.createdAt))}</time></dd></div><div><dt>Updated · IST</dt><dd><time dateTime={company.updatedAt}>{dateFormat.format(new Date(company.updatedAt))}</time></dd></div>
        </dl><div className="workspace-actions"><Link className="workspace-button" to={`/orders?companyId=${encodeURIComponent(company.id)}`}>View company orders</Link></div><CompanyPartners key={company.id} companyId={company.id} companyName={company.displayName} canProvision={!query.isError && !query.isFetching} /></section>
        <section className="workspace-card" aria-labelledby="payout-heading"><h2 id="payout-heading">Payout split</h2>
          {rates.isPending && <p role="status">Loading payout split…</p>}
          {rates.isError && <RequestFeedback error={rates.error} onRetry={() => { void rates.refetch() }} pending={rates.isFetching} />}
          {rates.isError && currentRate && <p className="workspace-notice workspace-warning">This payout split is from the previous successful load and may be stale.</p>}
          {currentRate && <dl className="workspace-definition"><div><dt>Driver share</dt><dd>{currentRate.driverPercent}%</dd></div><div><dt>Company share</dt><dd>{currentRate.companyPercent}%</dd></div><div className="workspace-span"><dt>Effective from · IST</dt><dd><time dateTime={currentRate.effectiveFrom}>{dateFormat.format(new Date(currentRate.effectiveFrom))}</time></dd></div></dl>}
          {rates.data && !currentRate && <p className="workspace-notice" role="status">{rates.hasNextPage ? 'No current payout split on the loaded history pages.' : 'Current payout split unavailable.'}</p>}
          {!currentRate && rates.hasNextPage && <button className="workspace-button" type="button" disabled={rates.isFetching || rateDelay > 0} onClick={() => { void rates.fetchNextPage() }}>{rates.isFetching ? 'Loading…' : 'Check older rate records'}</button>}
          <div className="workspace-notice"><strong>Rate history is preserved</strong><p>Future closures use the applicable rate. Closed financial records remain unchanged.</p></div>
          <button className="workspace-button" type="button" disabled={rates.isFetching || rateDelay > 0} onClick={() => { void rates.refetch() }}>Refresh payout split</button>
        </section></div>
      </>}
    </>}
  </>
}
