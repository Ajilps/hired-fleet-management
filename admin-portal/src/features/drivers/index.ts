import { lazy } from 'react'
export const CreateDriverPage = lazy(() => import('./pages/CreateDriverPage').then((module) => ({ default: module.CreateDriverPage })))
export { DriversPage } from './pages/DriversPage'
export { DriverDetailPage } from './pages/DriverDetailPage'
