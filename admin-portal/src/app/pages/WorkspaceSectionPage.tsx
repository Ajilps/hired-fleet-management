import { NavigationIcon } from '../layout/NavigationIcon'
import type { NavigationIconName } from '../layout/navigation-items'

type WorkspaceSectionPageProps = { title: string; description: string; icon: NavigationIconName }

export function WorkspaceSectionPage({ title, description, icon }: WorkspaceSectionPageProps) {
  return (
    <>
      <div className="admin-page-heading"><h1 id="page-heading">{title}</h1><p>{description}</p></div>
      <section className="admin-section-notice" aria-labelledby="section-notice-heading">
        <span className="admin-section-icon"><NavigationIcon name={icon} /></span>
        <span className="admin-section-label">Coming soon</span>
        <h2 id="section-notice-heading">{title} is being prepared</h2>
        <p>This section will be available as your workspace expands.</p>
      </section>
    </>
  )
}
