import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../../../shared/api/api-client'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useProvisionPartner } from '../hooks/use-provision-partner'
import { validatePartner } from '../validation/partner-validation'
import type { CompanyPartner, PartnerDraft } from '../types/partner-types'

type ProvisionPartnerDialogProps = { companyId: string; companyName: string; onClose: () => void; onSaved: (partner: CompanyPartner) => void; onRefresh: () => Promise<boolean> }
const emptyDraft: PartnerDraft = { fullName: '', email: '', phone: '', initialPassword: '', isPrimaryContact: false }
export function ProvisionPartnerDialog({ companyId, companyName, onClose, onSaved, onRefresh }: ProvisionPartnerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [draft, setDraft] = useState<PartnerDraft>(emptyDraft)
  const [errors, setErrors] = useState<Partial<Record<keyof PartnerDraft, string>>>({})
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [reviewedError, setReviewedError] = useState<Error | null>(null)
  const command = useProvisionPartner(companyId)
  const isLocked = command.isPending || command.isUncertain
  const isConflict = command.error instanceof ApiError && command.error.status === 409 && command.error.code !== 'COMMAND_IN_PROGRESS'
  const hasConflictToReview = isConflict && reviewedError !== command.error
  useEffect(() => {
    const dialog = dialogRef.current!
    dialog.showModal()
    ;(formRef.current?.elements.namedItem('fullName') as HTMLElement)?.focus()
    return () => { dialog.close() }
  }, [])
  function handleClose() { dialogRef.current?.close(); onClose() }
  function handleChange(key: keyof PartnerDraft, value: string | boolean) {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setErrors((previous) => ({ ...previous, [key]: undefined }))
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (hasConflictToReview || isRefreshing) return
    let input = null
    if (!command.isUncertain) {
      const email = formRef.current!.elements.namedItem('email') as HTMLInputElement
      email.value = draft.email.trim()
      const result = validatePartner(draft, email.validity.valid)
      setErrors(result.errors)
      if (!result.input) { (formRef.current!.elements.namedItem(Object.keys(result.errors)[0]) as HTMLElement)?.focus(); return }
      input = result.input
    }
    const saved = await command.run(input)
    if (saved) { setDraft(emptyDraft); setIsPasswordVisible(false); dialogRef.current?.close(); onSaved(saved) }
  }
  async function handleRefresh() {
    setIsRefreshing(true)
    try { if (await onRefresh()) setReviewedError(command.error) }
    finally { setIsRefreshing(false) }
  }
  return <dialog ref={dialogRef} className="companies-partner-dialog" aria-labelledby="provision-heading" aria-describedby="provision-scope" onCancel={(event) => { event.preventDefault(); if (!isLocked && !isRefreshing) handleClose() }}>
    <h2 id="provision-heading">Create partner account</h2><p id="provision-scope">Account access is restricted to <strong>{companyName}</strong>.</p>
    <form ref={formRef} noValidate aria-busy={command.isPending} onSubmit={(event) => { void handleSubmit(event) }}>
      <fieldset disabled={isLocked || isRefreshing}><legend className="companies-visually-hidden">Partner account details</legend>
        {([{ key: 'fullName', label: 'Partner name *', type: 'text', max: 150, autoComplete: 'name' }, { key: 'email', label: 'Email / login *', type: 'email', max: 255, autoComplete: 'off' }, { key: 'phone', label: 'Phone · optional', type: 'tel', max: 30, autoComplete: 'tel' }] as const).map(({ key, label, type, max, autoComplete }) => <label className="workspace-field" key={key}><span id={`partner-${key}-label`}>{label}</span><input id={`partner-${key}`} name={key} aria-labelledby={`partner-${key}-label`} type={type} required={key !== 'phone'} maxLength={max} autoComplete={autoComplete} value={draft[key]} onChange={(event) => handleChange(key, event.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `partner-${key}-error` : undefined} />{errors[key] && <span id={`partner-${key}-error`} className="workspace-field-error">{errors[key]}</span>}</label>)}
        <label className="workspace-field"><span id="partner-password-label">Initial password *</span><input id="partner-initialPassword" name="initialPassword" aria-labelledby="partner-password-label" type={isPasswordVisible ? 'text' : 'password'} autoComplete="new-password" required minLength={15} maxLength={128} value={draft.initialPassword} onChange={(event) => handleChange('initialPassword', event.target.value)} aria-invalid={Boolean(errors.initialPassword)} aria-describedby={`partner-password-help${errors.initialPassword ? ' partner-password-error' : ''}`} />{errors.initialPassword && <span id="partner-password-error" className="workspace-field-error">{errors.initialPassword}</span>}</label>
        <button className="workspace-button" type="button" aria-pressed={isPasswordVisible} aria-controls="partner-initialPassword" onClick={() => setIsPasswordVisible((previous) => !previous)}>{isPasswordVisible ? 'Hide initial password' : 'Show initial password'}</button>
        <label className="companies-partner-checkbox"><input name="isPrimaryContact" type="checkbox" checked={draft.isPrimaryContact} onChange={(event) => handleChange('isPrimaryContact', event.target.checked)} />Primary company contact</label>
      </fieldset>
      <p id="partner-password-help" className="workspace-muted">Use 15–128 characters and share credentials securely. The partner must change this password on first login. The initial password is cleared when this dialog closes or the account is saved.</p>
      {Object.values(errors).some(Boolean) && <p className="workspace-notice workspace-error" role="alert">Check the highlighted partner account fields.</p>}
      {command.error && <><h3 className="companies-provision-error">Account setup could not be confirmed</h3><RequestFeedback error={command.error} /><p className="workspace-muted">The company profile is already saved. Your account details are preserved for retry.</p></>}
      {command.isUncertain && <p className="workspace-notice workspace-warning" role="status">The account save outcome is unknown. Keep this dialog open and retry the same account to confirm the result. Details are locked; leaving or reloading loses this retry identity.</p>}
      {isConflict && <><button className="workspace-button" type="button" disabled={isRefreshing || command.delay > 0} onClick={() => { void handleRefresh() }}>{isRefreshing ? 'Refreshing accounts…' : 'Refresh partner accounts for review'}</button><p className="workspace-muted">{hasConflictToReview ? 'Refresh the account list, then review the email and details before submitting again.' : 'Account list refreshed. Review the details before submitting again.'}</p></>}
      <div className="workspace-actions"><button className="workspace-button" type="button" disabled={isLocked || isRefreshing} onClick={handleClose}>Cancel</button><button className="workspace-button workspace-button-primary" type="submit" disabled={command.isPending || command.delay > 0 || hasConflictToReview || isRefreshing}>{command.isPending ? 'Creating account…' : command.isUncertain ? 'Retry same account' : command.error ? 'Retry account setup' : 'Create account'}</button></div>
    </form>
  </dialog>
}
