import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router'
import { isAdminSessionActive } from '../validation/session-validation'
import { SignInError } from '../errors/sign-in-error'
import { validateLoginForm } from '../validation/login-validation'
import { useAuth } from '../hooks/use-auth'
import hiredLogo from '../../../shared/assets/hired-logo.svg'
import './admin-login.css'

export function AdminLoginPage() {
  const { session, hasSessionExpired, isSigningIn, signIn } = useAuth()
  const isSubmitting = isSigningIn
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [message, setMessage] = useState('')
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLDivElement>(null)
  const remainingSeconds = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0
  const isThrottled = remainingSeconds > 0

  useEffect(() => {
    if (!retryAt) return
    const interval = window.setInterval(() => {
      const currentTime = Date.now()
      setNow(currentTime)
      if (currentTime >= retryAt) {
        setRetryAt(null)
        setMessage('You can try signing in again.')
      }
    }, 1000)
    return () => window.clearInterval(interval)
  }, [retryAt])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting || isThrottled) return
    const normalizedEmail = email.trim()
    const nextErrors = validateLoginForm(normalizedEmail, password, Boolean(emailRef.current?.validity.valid))
    setErrors(nextErrors)
    setMessage('')
    if (nextErrors.email || nextErrors.password) {
      const invalidInputRef = nextErrors.email ? emailRef : passwordRef
      invalidInputRef.current?.focus()
      return
    }
    try {
      await signIn(normalizedEmail, password)
      setPassword('')
      setIsPasswordVisible(false)
    } catch (error) {
      setMessage(error instanceof SignInError ? error.message : 'Sign in could not be completed. Please try again.')
      setRetryAt(error instanceof SignInError ? error.retryAt : null)
      setNow(Date.now())
      messageRef.current?.focus()
    }
  }

  useEffect(() => { document.title = 'Sign in | HireD Admin' }, [])

  if (isAdminSessionActive(session)) return <Navigate to="/overview" replace />

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="HireD admin portal">
        <img className="login-logo" src={hiredLogo} alt="HireD" width="1390" height="632" />
        <h1>Every trip.<br />One clear workspace.</h1>
        <p>Manage orders, drivers and company operations with confidence.</p>
        <span className="login-portal-label">Admin portal</span>
      </section>
      <section className="login-content" aria-labelledby="login-heading">
        <div className="login-card">
          <h2 id="login-heading">Welcome back</h2>
          <p className="login-subtitle">Sign in to your HireD admin account.</p>
          {hasSessionExpired && (
            <div className="login-notice" role="status">
              <strong>Your session expired</strong><p>Sign in again to continue.</p>
            </div>
          )}
          <form className="login-form" onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
            <div className="login-field">
              <label htmlFor="email">Email address</label>
              <input
                ref={emailRef} id="email" name="email" type="email" autoComplete="username"
                placeholder="you@company.com" value={email} required maxLength={255}
                autoCapitalize="none" spellCheck={false} readOnly={isSubmitting}
                aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined}
                onChange={(event) => { setEmail(event.target.value); setErrors({ ...errors, email: undefined }) }}
              />
              {errors.email && <p id="email-error" className="login-field-error">{errors.email}</p>}
            </div>
            <div className="login-field">
              <label htmlFor="password">Password</label>
              <div className="login-password">
                <input
                  ref={passwordRef} id="password" name="password"
                  type={isPasswordVisible ? 'text' : 'password'} autoComplete="current-password"
                  placeholder="Enter your password" value={password} required maxLength={1024}
                  readOnly={isSubmitting} aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  onChange={(event) => { setPassword(event.target.value); setErrors({ ...errors, password: undefined }) }}
                />
                <button className="login-password-toggle" type="button"
                  aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                  aria-pressed={isPasswordVisible} aria-controls="password"
                  onClick={() => setIsPasswordVisible(!isPasswordVisible)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                    {isPasswordVisible && <path d="m3 3 18 18" />}
                  </svg>
                </button>
              </div>
              {errors.password && <p id="password-error" className="login-field-error">{errors.password}</p>}
            </div>
            <div ref={messageRef} tabIndex={-1} className={message ? 'login-feedback' : undefined} role="alert">{message}</div>
            {isThrottled && <p className="login-retry">Try again in {remainingSeconds} {remainingSeconds === 1 ? 'second' : 'seconds'}.</p>}
            <button className="login-submit" type="submit" disabled={isSubmitting || isThrottled}>
              {isSubmitting ? 'Signing in…' : isThrottled ? 'Try again later' : 'Sign in'}
            </button>
            <p className="login-help">Use the credentials provided by your administrator.</p>
          </form>
        </div>
      </section>
    </main>
  )
}
