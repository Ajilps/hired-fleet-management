import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useCurrentAdmin } from '../../features/auth'
import hiredLogo from '../../shared/assets/hired-logo.svg'
import { AdminNavigation } from './AdminNavigation'
import { navigationItems } from './navigation-items'
import './admin-layout.css'

export function AdminLayout() {
  const { pathname } = useLocation()
  const { data: identity } = useCurrentAdmin()
  const drawerRef = useRef<HTMLDialogElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const normalizedPath = pathname.replace(/\/+$/, '').toLowerCase()
  const item = navigationItems.find((entry) => entry.path === normalizedPath)
  const title = item?.label ?? 'Page not found'
  const initials = identity?.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((name) => name[0]).join('').toUpperCase()
  const today = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date())

  function handleOpenMenu() {
    drawerRef.current?.showModal()
    setIsDrawerOpen(true)
  }

  function handleCloseMenu() {
    drawerRef.current?.close()
  }

  useEffect(() => {
    if (drawerRef.current?.open) drawerRef.current.close()
    document.title = `${title} | HireD Admin`
    mainRef.current?.focus()
  }, [pathname, title])

  useEffect(() => {
    if (!isDrawerOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function handleResize() {
      if (window.innerWidth >= 900) drawerRef.current?.close()
    }
    window.addEventListener('resize', handleResize)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('resize', handleResize)
    }
  }, [isDrawerOpen])

  return (
    <div className="admin-layout">
      <a className="admin-skip-link" href="#workspace-content">Skip to content</a>
      <aside className="admin-desktop-sidebar"><AdminNavigation /></aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-mobile-brand">
            <button className="admin-menu-toggle" type="button" onClick={handleOpenMenu} aria-label="Open navigation" aria-controls="admin-mobile-navigation" aria-expanded={isDrawerOpen}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <img src={hiredLogo} alt="HireD" width="1390" height="632" />
          </div>
          <nav className="admin-breadcrumb" aria-label="Breadcrumb"><span>Admin workspace</span><span aria-hidden="true">/</span><span aria-current="page">{title}</span></nav>
          <div className="admin-topbar-context">
            <span className="admin-scope">All companies</span>
            <time className="admin-date">{today} · IST</time>
            <span className="admin-role">Admin</span>
            <span className="admin-avatar" aria-label={`Signed in as ${identity?.fullName}`}>{initials}</span>
          </div>
        </header>
        <main id="workspace-content" className="admin-main" ref={mainRef} tabIndex={-1} aria-labelledby="page-heading"><Outlet /></main>
      </div>
      <dialog className="admin-mobile-drawer" id="admin-mobile-navigation" ref={drawerRef} aria-label="Admin navigation" onClose={() => setIsDrawerOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) handleCloseMenu() }}>
        <button className="admin-drawer-close" type="button" onClick={handleCloseMenu} aria-label="Close navigation">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
        <AdminNavigation onNavigate={handleCloseMenu} />
      </dialog>
    </div>
  )
}
