import { useState } from 'react'
import { NavLink } from 'react-router'
import { useAuth, useCurrentAdmin } from '../../features/auth'
import hiredLogo from '../../shared/assets/hired-logo.svg'
import { NavigationIcon } from './NavigationIcon'
import { navigationItems } from './navigation-items'

type AdminNavigationProps = { onNavigate?: () => void }

export function AdminNavigation({ onNavigate }: AdminNavigationProps) {
  const { session, signOut, isSigningOut } = useAuth()
  const { data: identity } = useCurrentAdmin()
  const [logoutError, setLogoutError] = useState('')
  const user = identity ?? session?.user

  async function handleSignOut() {
    setLogoutError('')
    try { await signOut() }
    catch { setLogoutError('Unable to sign out. Check your connection and try again.') }
  }

  return (
    <div className="admin-navigation-content">
      <div className="admin-brand">
        <img src={hiredLogo} alt="HireD" width="1390" height="632" />
        <span>Operations workspace</span>
      </div>
      <nav className="admin-navigation" aria-label="Main navigation">
        {navigationItems.map((item) => (
          <NavLink key={item.path} to={item.path} onClick={onNavigate} className={({ isActive }) => isActive ? 'admin-nav-link is-active' : 'admin-nav-link'}>
            <NavigationIcon name={item.icon} /><span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="admin-account">
        <strong>{user?.fullName}</strong>
        <span className="admin-account-email">{user?.email}</span>
        <span>Administrator · All companies</span>
        <button type="button" className="admin-sign-out" onClick={handleSignOut} disabled={isSigningOut}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 3H4v18h5M9 12h12m-4-4 4 4-4 4" /></svg>
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </button>
        {logoutError && <p className="admin-logout-error" role="alert">{logoutError}</p>}
      </div>
    </div>
  )
}
