import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../hooks/use-auth'
import { useChangePassword } from '../hooks/use-change-password'
import { validatePasswordChange } from '../validation/password-validation'
import type { PasswordDraft } from '../validation/password-validation'
import hiredLogo from '../../../shared/assets/hired-logo.svg'
import '../components/session-status.css'
import './admin-login.css'
import './change-password.css'

const empty: PasswordDraft = { currentPassword: '', newPassword: '', confirmation: '' }
export function ChangePasswordPage() {
  const navigate = useNavigate()
  const { session, signOut, isSigningOut } = useAuth()
  const command = useChangePassword()
  const form = useRef<HTMLFormElement>(null)
  const [draft, setDraft] = useState(empty)
  const [errors, setErrors] = useState<Partial<Record<keyof PasswordDraft, string>>>({})
  const [isVisible, setIsVisible] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  useEffect(() => { document.title = 'Change password | HireD Admin'; (form.current?.elements.namedItem('currentPassword') as HTMLElement)?.focus() }, [])
  const isLocked = command.isPending || command.isUncertain || isSigningOut
  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (isLocked || command.delay) return
    const next = validatePasswordChange(draft)
    setErrors(next)
    if (Object.keys(next).length) { (form.current?.elements.namedItem(Object.keys(next)[0]!) as HTMLElement)?.focus(); return }
    if (await command.run({ currentPassword: draft.currentPassword, newPassword: draft.newPassword })) {
      setDraft(empty); setIsVisible(false)
      navigate('/login', { replace: true, state: { passwordChanged: true } })
    }
  }
  async function handleSignOut() {
    setLogoutError('')
    try { await signOut(); setDraft(empty); navigate('/login', { replace: true }) }
    catch { setLogoutError('Unable to sign out. Check your connection and try again.') }
  }
  return <main className="session-status change-password-page"><section className="session-status-card" aria-labelledby="change-password-heading">
    <img src={hiredLogo} alt="HireD" width="1390" height="632" />
    <h1 id="change-password-heading">Change your password</h1>
    <p>{session?.user.passwordChangeRequired ? 'Choose your own password before opening the admin workspace.' : 'Choose a new password for your admin account.'} All sessions will end; sign in again afterward.</p>
    <p className="change-password-account">{session?.user.email}</p>
    <form ref={form} className="login-form" noValidate aria-busy={command.isPending} onSubmit={(event) => { void handleSubmit(event) }}>
      {([{ key: 'currentPassword', label: 'Current password', autoComplete: 'current-password', max: 1024 }, { key: 'newPassword', label: 'New password', autoComplete: 'new-password', max: 128 }, { key: 'confirmation', label: 'Confirm new password', autoComplete: 'new-password', max: 128 }] as const).map(({ key, label, autoComplete, max }) => <div className="login-field" key={key}>
        <label htmlFor={`change-${key}`}>{label}</label><input id={`change-${key}`} name={key} type={isVisible ? 'text' : 'password'} autoComplete={autoComplete} value={draft[key]} maxLength={max} required readOnly={isLocked} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `change-${key}-error` : key === 'newPassword' ? 'new-password-help' : undefined} onChange={(event) => { setDraft((value) => ({ ...value, [key]: event.target.value })); setErrors((value) => ({ ...value, [key]: undefined })) }} />
        {errors[key] && <p id={`change-${key}-error`} className="login-field-error">{errors[key]}</p>}
      </div>)}
      <p id="new-password-help">Use 15–128 characters. Spaces are preserved.</p>
      <button className="password-visibility" type="button" aria-pressed={isVisible} disabled={command.isPending || isSigningOut} onClick={() => setIsVisible((value) => !value)}>{isVisible ? 'Hide passwords' : 'Show passwords'}</button>
      {command.error && <p className="login-feedback" role="alert">{command.error.message}</p>}
      {command.delay > 0 && <p role="status">Try again in {command.delay} seconds.</p>}
      <button className="login-submit" type="submit" disabled={isLocked || command.delay > 0}>{command.isPending ? 'Changing password…' : 'Change password'}</button>
    </form>
    <div className="session-status-actions"><button type="button" disabled={command.isPending || isSigningOut} onClick={() => { void handleSignOut() }}>{isSigningOut ? 'Signing out…' : command.isUncertain ? 'Sign out and check password' : 'Sign out'}</button></div>
    {logoutError && <p role="alert">{logoutError}</p>}
  </section></main>
}
