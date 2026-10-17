import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="admin-section-notice">
      <span className="admin-section-label">404</span>
      <h1 id="page-heading">Page not found</h1>
      <p>This page is unavailable. Return to your workspace to continue.</p>
      <Link className="admin-primary-link" to="/overview">Back to overview</Link>
    </section>
  )
}
