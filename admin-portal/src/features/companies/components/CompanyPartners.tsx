import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError } from '../../../shared/api/api-client'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useRetryDelay } from '../../../shared/hooks/use-retry-delay'
import { useCompanyPartners } from '../hooks/use-company-partners'
import { ProvisionPartnerDialog } from './ProvisionPartnerDialog'
import type { CompanyPartner } from '../types/partner-types'

type CompanyPartnersProps = { companyId: string; companyName: string; canProvision: boolean }
export function CompanyPartners({ companyId, companyName, canProvision }: CompanyPartnersProps) {
  const [params, setParams] = useSearchParams()
  const cursor = params.get('partnerCursor') ?? ''
  const query = useCompanyPartners(companyId, cursor)
  const delay = useRetryDelay(query.error)
  const arePartnerAccountsUnavailable = query.error instanceof ApiError && query.error.status === 404
  const [isOpen, setIsOpen] = useState(false)
  const [saved, setSaved] = useState<CompanyPartner | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  function handleClose() { setIsOpen(false); triggerRef.current?.focus() }
  function handleSaved(partner: CompanyPartner) {
    setSaved(partner)
    const next = new URLSearchParams(params)
    next.delete('partnerCursor'); next.delete('previousPartnerCursor')
    setParams(next, { replace: true })
    handleClose()
  }
  function handleNext() {
    const nextCursor = query.data?.pageInfo.nextCursor
    if (!nextCursor) return
    const next = new URLSearchParams(params)
    next.append('previousPartnerCursor', cursor); next.set('partnerCursor', nextCursor)
    setParams(next)
  }
  function handlePrevious() {
    const previous = params.getAll('previousPartnerCursor')
    const previousCursor = previous.pop()
    const next = new URLSearchParams(params)
    next.delete('previousPartnerCursor')
    previous.forEach((value) => next.append('previousPartnerCursor', value))
    if (previousCursor) next.set('partnerCursor', previousCursor)
    else next.delete('partnerCursor')
    setParams(next)
  }
  return <section className="companies-partners" aria-labelledby="partner-accounts-heading"><h3 id="partner-accounts-heading">Partner accounts</h3>
    <p className="workspace-muted">These accounts are scoped to {companyName}.</p>
    <div className="workspace-actions"><button className="workspace-button" type="button" disabled={query.isFetching || delay > 0} onClick={() => { void query.refetch() }}>Refresh partner accounts</button><button ref={triggerRef} className="workspace-button workspace-button-primary" type="button" disabled={!canProvision || arePartnerAccountsUnavailable} onClick={() => setIsOpen(true)}>Provision partner account</button></div>
    {!canProvision && <p className="workspace-muted">Refresh the company profile before provisioning a new account.</p>}
    {saved && <p className="workspace-notice workspace-success" role="status">Partner account saved for {saved.user.fullName} ({saved.user.email}). Access is restricted to {companyName}. Share issued credentials securely.</p>}
    {query.isPending && <p role="status">Loading partner accounts…</p>}
    {query.isError && (arePartnerAccountsUnavailable ? <p className="workspace-notice workspace-error" role="alert">Partner accounts are currently unavailable. Try refreshing later.</p> : <RequestFeedback error={query.error} pending={query.isFetching} onRetry={() => { void query.refetch() }} />)}
    {query.data && <>
      {query.isError && <p className="workspace-notice workspace-warning">These partner accounts are from the previous successful load and may be stale.</p>}
      {query.data.items.length ? <table className="companies-table"><caption>Partner accounts · newest first</caption><thead><tr><th scope="col">Name</th><th scope="col">Contact</th><th scope="col">State</th><th scope="col">Primary contact</th></tr></thead><tbody>{query.data.items.map((partner) => <tr key={partner.user.id}><td data-label="Name">{partner.user.fullName}</td><td data-label="Contact">{partner.user.email}<small>{partner.user.phone ?? 'Phone not provided'}</small></td><td data-label="State"><span className={`workspace-badge companies-status-${partner.user.isActive ? 'active' : 'inactive'}`}>{partner.user.isActive ? 'Active' : 'Inactive'}</span></td><td data-label="Primary contact">{partner.isPrimaryContact ? 'Yes' : 'No'}</td></tr>)}</tbody></table> : <p className="workspace-notice" role="status">No partner accounts on this page.</p>}
      <div className="companies-pagination"><p className="workspace-muted">{query.data.items.length} loaded · {query.data.pageInfo.totalCount.toLocaleString('en-IN')} accounts in total · Page {params.getAll('previousPartnerCursor').length + 1}</p><div className="workspace-actions"><button className="workspace-button" type="button" disabled={!cursor || query.isFetching} onClick={handlePrevious}>← Previous accounts</button><button className="workspace-button" type="button" disabled={query.isFetching || query.isError || !query.data.pageInfo.hasMore || params.getAll('previousPartnerCursor').includes(query.data.pageInfo.nextCursor ?? '')} onClick={handleNext}>Next accounts →</button></div></div>
    </>}
    {isOpen && <ProvisionPartnerDialog companyId={companyId} companyName={companyName} onClose={handleClose} onSaved={handleSaved} onRefresh={async () => { const result = await query.refetch(); return result.isSuccess }} />}
  </section>
}
