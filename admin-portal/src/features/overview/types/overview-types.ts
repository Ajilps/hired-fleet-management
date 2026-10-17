export type OverviewSection = 'orders' | 'ongoing' | 'unassigned' | 'statements'

// Minimal view models: do not retain contacts, money, documents or other unused API fields.
export type OverviewRecord = {
  id: string
  companyId: string
  route?: string
  pickupAt?: string
  periodStart?: string
}

export type OverviewSummary = {
  totalCount: number
  items: OverviewRecord[]
}

export const overviewSections = [
  { key: 'orders', label: 'Orders awaiting decision', description: 'Review incoming requests', path: '/orders', status: 'received', badge: 'Received', limit: 3, listTitle: 'Incoming orders', emptyMessage: 'No orders awaiting decision.', linkLabel: 'View all orders' },
  { key: 'ongoing', label: 'Ongoing trips', description: 'Trips currently in progress', path: '/trips', status: 'ongoing', badge: 'Ongoing', limit: 1, listTitle: 'Active trip snapshot', emptyMessage: 'No trips currently in progress.', linkLabel: 'View trips' },
  { key: 'unassigned', label: 'Unassigned trips', description: 'Ready for driver assignment', path: '/trips', status: 'unassigned', badge: 'Unassigned', limit: 1, listTitle: 'Trips needing a driver', emptyMessage: 'No trips waiting for assignment.', linkLabel: 'Open trips for assignment' },
  { key: 'statements', label: 'Statements awaiting approval', description: 'Awaiting required admin approvals', path: '/statements', status: 'pending_verification', badge: 'Pending verification', limit: 1, listTitle: 'Statements to review', emptyMessage: 'No statements awaiting approval.', linkLabel: 'Review statements' },
] as const
