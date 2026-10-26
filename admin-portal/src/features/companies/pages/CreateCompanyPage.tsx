import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useCreateCompany } from '../hooks/use-create-company'
import { safeCompaniesReturn, splitPreview, validateCompany } from '../validation/company-validation'
import type { CompanyDraft } from '../types/company-types'
import './companies.css'

const emptyDraft: CompanyDraft = { legalName: '', displayName: '', contactName: '', contactEmail: '', contactPhone: '', billingAddress: '', driverPercent: '', companyPercent: '' }
const fields = [
  { key: 'legalName', label: 'Legal company name', max: 200, autoComplete: 'organization' },
  { key: 'displayName', label: 'Display name', max: 200 },
  { key: 'contactName', label: 'Contact name', max: 150, autoComplete: 'name' },
  { key: 'contactEmail', label: 'Contact email', max: 255, type: 'email', autoComplete: 'email' },
  { key: 'contactPhone', label: 'Contact phone', max: 30, type: 'tel', autoComplete: 'tel' },
] as const
export function CreateCompanyPage() {
  const [params] = useSearchParams()
  const returnTo = safeCompaniesReturn(params.get('returnTo'))
  const navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)
  const [draft, setDraft] = useState<CompanyDraft>(emptyDraft)
  const [errors, setErrors] = useState<Partial<Record<keyof CompanyDraft, string>>>({})
  const command = useCreateCompany()
  const isLocked = command.isPending || command.isUncertain
  const preview = splitPreview(draft.driverPercent, draft.companyPercent)
  function handleChange(key: keyof CompanyDraft, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setErrors((previous) => ({ ...previous, [key]: undefined }))
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    let input = null
    if (!command.isUncertain) {
      const email = formRef.current?.elements.namedItem('contactEmail') as HTMLInputElement
      email.value = draft.contactEmail.trim()
      const result = validateCompany(draft, email.validity.valid)
      setErrors(result.errors)
      if (!result.input) {
        const first = Object.keys(result.errors)[0]
        ;(formRef.current?.elements.namedItem(first) as HTMLElement | null)?.focus()
        return
      }
      input = result.input
    }
    const saved = await command.run(input)
    if (saved) navigate(`/companies/${saved.id}?returnTo=${encodeURIComponent(returnTo)}`, { replace: true, state: { savedCompanyId: saved.id } })
  }
  function feedback(key: keyof CompanyDraft) { return errors[key] ? <span id={`${key}-error`} className="workspace-field-error">{errors[key]}</span> : null }
  return <>
    <Link className="workspace-back" to={returnTo}>← Back to companies</Link>
    <div className="admin-page-heading"><h1 id="page-heading">Create company</h1><p>Set up the company profile and required payout split.</p></div>
    <form ref={formRef} onSubmit={(event) => { void handleSubmit(event) }} noValidate className="companies-layout companies-creation" aria-busy={command.isPending}>
      <fieldset disabled={isLocked} className="workspace-card"><legend className="companies-legend">Company information</legend><div className="workspace-fields">
        {fields.map(({ key, label, max, ...props }) => <label className={`workspace-field ${key === 'legalName' || key === 'displayName' ? 'workspace-span' : ''}`} key={key}><span id={`${key}-label`}>{label} *</span><input id={key} name={key} required maxLength={max} {...props} aria-labelledby={`${key}-label`} value={draft[key]} onChange={(event) => handleChange(key, event.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined} />{feedback(key)}</label>)}
        <label className="workspace-field workspace-span"><span id="billingAddress-label">Billing address *</span><textarea id="billingAddress" name="billingAddress" aria-labelledby="billingAddress-label" autoComplete="street-address" maxLength={4000} required value={draft.billingAddress} onChange={(event) => handleChange('billingAddress', event.target.value)} aria-invalid={Boolean(errors.billingAddress)} aria-describedby={errors.billingAddress ? 'billingAddress-error' : undefined} />{feedback('billingAddress')}</label>
      </div></fieldset>
      <section className="workspace-card" aria-labelledby="split-heading"><h2 id="split-heading">Initial payout split</h2><fieldset disabled={isLocked} className="companies-split-fields"><legend className="companies-visually-hidden">Required percentage shares</legend>
        {(['driverPercent', 'companyPercent'] as const).map((key) => <label className="workspace-field" key={key}><span id={`${key}-label`}>{key === 'driverPercent' ? 'Driver share · % *' : 'Company share · % *'}</span><input id={key} name={key} aria-labelledby={`${key}-label`} type="text" inputMode="decimal" required value={draft[key]} onChange={(event) => handleChange(key, event.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={`split-help${errors[key] ? ` ${key}-error` : ''}`} />{feedback(key)}</label>)}
        <p id="split-help" className="workspace-muted">Both shares must be greater than 0 and total exactly 100.00%. Use up to two decimal places.</p>
      </fieldset><div className="workspace-notice" aria-live="polite"><strong>Calculation preview</strong><p>{preview ? `₹10,000.00 trip → ${preview.driver} driver + ${preview.company} company.` : 'Enter a valid split to preview the shares on a ₹10,000.00 trip.'}</p><p>Estimated shares. Expenses are shown separately.</p></div>
        <p className="workspace-muted">The company and initial payout split are saved together. Partner accounts are provisioned separately.</p>
        <div className="workspace-actions">{isLocked ? <button type="button" className="workspace-button" disabled>Cancel</button> : <Link className="workspace-button" to={returnTo}>Cancel</Link>}<button className="workspace-button workspace-button-primary" type="submit" disabled={command.isPending || command.delay > 0}>{command.isPending ? 'Saving company…' : command.isUncertain ? 'Retry same company' : 'Create company'}</button></div>
      </section>
      <div className="workspace-span">{Object.values(errors).some(Boolean) && <p className="workspace-notice workspace-error" role="alert">Check the highlighted company fields before creating the company.</p>}
        {command.error && <RequestFeedback error={command.error} />}
        {command.isUncertain && <p className="workspace-notice workspace-warning" role="status">The save outcome is unknown. Keep this page open and retry the same company to confirm the result. The original details and payout split are locked to prevent duplicate creation; leaving or reloading loses this retry identity.</p>}
      </div>
    </form>
  </>
}
