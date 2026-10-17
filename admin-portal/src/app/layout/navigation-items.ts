export const navigationItems = [
  { path: '/overview', label: 'Overview', title: 'Operations overview', icon: 'overview', description: 'Today’s orders, trips and approvals at a glance.' },
  { path: '/orders', label: 'Orders', title: 'Orders', icon: 'orders', description: 'Manage incoming requests and order decisions.' },
  { path: '/trips', label: 'Trips', title: 'Trips', icon: 'trips', description: 'Manage assignments and follow trip progress.' },
  { path: '/drivers', label: 'Drivers', title: 'Drivers', icon: 'drivers', description: 'Review applications, active drivers and availability.' },
  { path: '/companies', label: 'Companies', title: 'Companies', icon: 'companies', description: 'Manage company profiles and partner accounts.' },
  { path: '/payroll-settings', label: 'Payroll settings', title: 'Payroll settings', icon: 'payroll', description: 'Manage payout splits and review rate history.' },
  { path: '/statements', label: 'Monthly statements', title: 'Monthly statements', icon: 'statements', description: 'Review monthly statements, approvals and publication.' },
  { path: '/reports', label: 'Reports', title: 'Reports', icon: 'reports', description: 'Explore operations and financial reports.' },
] as const

export type NavigationIconName = typeof navigationItems[number]['icon']
