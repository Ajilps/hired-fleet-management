import { useState } from 'react'
import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../hooks/use-auth'
import { useCurrentAdmin } from '../hooks/use-current-admin'
import { isAdminSessionActive } from '../validation/session-validation'
import hiredLogo from '../../../shared/assets/hired-logo.svg'
import './session-status.css'

export function RequireAdmin({ allowPasswordChange = false }: { allowPasswordChange?: boolean }) {
  const { session, signOut, isSigningOut } = useAuth()
  const identity = useCurrentAdmin()
  const [logoutError, setLogoutError] = useState('')

  async function handleSignOut() {
    setLogoutError('')
    try { await signOut() }
    catch { setLogoutError('Unable to sign out. Please try again.') }
  }

  if (!isAdminSessionActive(session)) return <Navigate to="/login" replace />
  if (identity.data) {
    if (!allowPasswordChange && (identity.data.passwordChangeRequired || session.user.passwordChangeRequired)) return <Navigate to="/change-password" replace />
    return <Outlet />
  }

  return (
    <main className="session-status">
      <div className="session-status-card" aria-busy={identity.isFetching}>
        <img src={hiredLogo} alt="HireD" width="1390" height="632" />
        <h1>{identity.isError ? 'We couldn’t verify your session' : 'Checking your session…'}</h1>
        {identity.isError ? (
          <>
            <p role="alert">{identity.error.message}</p>
            <div className="session-status-actions">
              <button type="button" onClick={() => void identity.refetch()} disabled={identity.isFetching}>
                {identity.isFetching ? 'Trying again…' : 'Try again'}
              </button>
              <button type="button" onClick={handleSignOut} disabled={isSigningOut}>
                {isSigningOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
            {logoutError && <p role="alert">{logoutError}</p>}
          </>
        ) : <p role="status">Preparing your admin workspace.</p>}
      </div>
    </main>
  )
}
