import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { RequestFeedback } from '../../../shared/components/RequestFeedback'
import { useProvisionDriver } from '../hooks/use-provision-driver'
import { validateDriverProvisioning } from '../validation/driver-provisioning'
import type { DriverDraft } from '../types/driver-types'
import './drivers.css'

const empty: DriverDraft = { fullName: '', email: '', phone: '', initialPassword: '', dateOfBirth: '', homeAddress: '' }
export function CreateDriverPage() {
 const navigate = useNavigate(); const form = useRef<HTMLFormElement>(null)
 const [draft, setDraft] = useState<DriverDraft>(empty); const [errors, setErrors] = useState<Partial<Record<keyof DriverDraft, string>>>({}); const [visible, setVisible] = useState(false)
 const command = useProvisionDriver(); const locked = command.isPending || command.isUncertain
 useEffect(() => { (form.current?.elements.namedItem('fullName') as HTMLElement)?.focus() }, [])
 function handleChange(key: keyof DriverDraft, value: string) { setDraft((before) => ({ ...before, [key]: value })); setErrors((before) => ({ ...before, [key]: undefined })) }
 async function handleSubmit(event: FormEvent) {
  event.preventDefault()
  if (command.isPending || command.delay > 0) return
  let input = null
  if (!command.isUncertain) {
   const email = form.current!.elements.namedItem('email') as HTMLInputElement; email.value = draft.email.trim()
   const result = validateDriverProvisioning(draft, email.validity.valid); setErrors(result.errors)
   if (!result.input) { (form.current!.elements.namedItem(Object.keys(result.errors)[0]!) as HTMLElement)?.focus(); return }
   input = result.input
  }
  const saved = await command.run(input)
  if (saved) { setDraft(empty); setVisible(false); navigate(`/drivers/${saved.id}?returnTo=${encodeURIComponent('/drivers?status=pending')}`, { replace: true, state: { driverCreated: saved.id } }) }
 }
 return <>
  <Link className="workspace-back" to="/drivers?status=pending">← Back to pending drivers</Link>
  <div className="workspace-heading"><div className="admin-page-heading"><h1 id="page-heading">Create driver account</h1><p>Admin-only onboarding. New drivers start pending and offline.</p></div></div>
  <section className="workspace-card" aria-labelledby="driver-account-heading"><h2 id="driver-account-heading">Driver account details</h2>
   <p className="workspace-notice">Share the initial credentials securely. The driver must change the password on first login. Operational access requires a separate admin activation.</p>
   <form ref={form} noValidate aria-busy={command.isPending} onSubmit={(event) => { void handleSubmit(event) }}>
    <fieldset className="driver-create-fields" disabled={locked}><legend className="drivers-visually-hidden">Driver identity and initial password</legend>
     {([{ key: 'fullName', label: 'Driver name *', type: 'text', max: 150, autoComplete: 'name' }, { key: 'email', label: 'Email / login *', type: 'email', max: 255, autoComplete: 'off' }, { key: 'phone', label: 'Phone *', type: 'tel', max: 30, autoComplete: 'tel' }, { key: 'dateOfBirth', label: 'Date of birth · optional', type: 'date', max: undefined, autoComplete: 'bday' }] as const).map(({ key, label, type, max, autoComplete }) => <label className="workspace-field" key={key}><span id={`driver-${key}-label`}>{label}</span><input aria-labelledby={`driver-${key}-label`} name={key} type={type} maxLength={max} required={key !== 'dateOfBirth'} autoComplete={autoComplete} value={draft[key]} onChange={(event) => handleChange(key, event.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `driver-${key}-error` : undefined} />{errors[key] && <span className="workspace-field-error" id={`driver-${key}-error`}>{errors[key]}</span>}</label>)}
     <label className="workspace-field"><span id="driver-password-label">Initial password *</span><input aria-labelledby="driver-password-label" name="initialPassword" type={visible ? 'text' : 'password'} minLength={15} maxLength={128} required autoComplete="new-password" value={draft.initialPassword} onChange={(event) => handleChange('initialPassword', event.target.value)} aria-invalid={Boolean(errors.initialPassword)} aria-describedby={`driver-password-help${errors.initialPassword ? ' driver-password-error' : ''}`} />{errors.initialPassword && <span id="driver-password-error" className="workspace-field-error">{errors.initialPassword}</span>}</label>
     <div className="driver-password-visibility"><button className="workspace-button" type="button" aria-pressed={visible} onClick={() => setVisible((before) => !before)}>{visible ? 'Hide initial password' : 'Show initial password'}</button></div>
     <label className="workspace-field workspace-span"><span id="driver-address-label">Home address · optional</span><textarea aria-labelledby="driver-address-label" aria-describedby={errors.homeAddress ? 'driver-address-error' : undefined} name="homeAddress" maxLength={2000} rows={3} autoComplete="street-address" value={draft.homeAddress} onChange={(event) => handleChange('homeAddress', event.target.value)} aria-invalid={Boolean(errors.homeAddress)} />{errors.homeAddress && <span id="driver-address-error" className="workspace-field-error">{errors.homeAddress}</span>}</label>
    </fieldset>
    <p className="workspace-muted" id="driver-password-help">Use 15–128 characters. Spaces are preserved. Credentials are cleared after saving or leaving this page.</p>
    {Object.values(errors).some(Boolean) && <p className="workspace-notice workspace-error" role="alert">Check the highlighted driver fields.</p>}
    {command.error && <RequestFeedback error={command.error} />}
    {command.isUncertain && <p className="workspace-notice workspace-warning">Account creation could not be confirmed. Retry this attempt to check its result. If you leave, inspect the driver directory before creating another account.</p>}
    {command.delay > 0 && <p role="status">Try again in {command.delay} seconds.</p>}
    <div className="workspace-actions"><button className="workspace-button workspace-button-primary" type="submit" disabled={command.isPending || command.delay > 0}>{command.isPending ? 'Creating account…' : command.isUncertain ? 'Retry account creation' : 'Create driver account'}</button><button className="workspace-button" type="button" disabled={command.isPending} onClick={() => navigate('/drivers?status=pending')}>Cancel</button></div>
   </form>
  </section>
 </>
}
