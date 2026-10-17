import type { NavigationIconName } from './navigation-items'
import type { ReactNode } from 'react'

type NavigationIconProps = { name: NavigationIconName }

export function NavigationIcon({ name }: NavigationIconProps) {
  const paths: Record<NavigationIconName, ReactNode> = {
    overview: <><path d="m12 3 9 9-9 9-9-9 9-9Z" /><path d="m12 7 5 5-5 5-5-5 5-5Z" /></>,
    orders: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h1M3 12h1M3 18h1" /></>,
    trips: <><path d="M4 19 20 3M12 3h8v8" /><path d="M4 6v5h5" /></>,
    drivers: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    companies: <><path d="M4 21V4h10v17M14 10h6v11M2 21h20M8 8h2M8 12h2M8 16h2M17 14h1M17 18h1" /></>,
    payroll: <><circle cx="12" cy="12" r="3" /><path d="m10 3-1 3-3 1-2 3 2 2-1 3 3 2 1 3h4l1-3 3-1 2-3-2-2 1-3-3-2-1-3Z" /></>,
    statements: <><path d="M5 3h10l4 4v14H5V3ZM14 3v5h5M8 12h8M8 16h8" /></>,
    reports: <><path d="M3 21h18M6 17V9M12 17V3M18 17v-5" /></>,
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
