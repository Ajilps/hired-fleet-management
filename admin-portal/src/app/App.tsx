import { Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { AdminLoginPage, ChangePasswordPage, RequireAdmin } from '../features/auth'
import { OperationsOverviewPage } from '../features/overview'
import { OrdersPage, CreateOrderPage, OrderDetailPage } from '../features/orders'
import { StatementsPage, StatementDetailPage } from '../features/statements'
import { TripSummaryPage, TripsPage } from '../features/trips'
import { CompaniesPage, CreateCompanyPage, CompanyDetailPage } from '../features/companies'
import { DriversPage, DriverDetailPage, CreateDriverPage } from '../features/drivers'
import { AdminLayout } from './layout/AdminLayout'
import { navigationItems } from './layout/navigation-items'
import { WorkspaceSectionPage } from './pages/WorkspaceSectionPage'
import { NotFoundPage } from './pages/NotFoundPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLoginPage />} />
      <Route element={<RequireAdmin allowPasswordChange />}><Route path="/change-password" element={<ChangePasswordPage />} /></Route>
      <Route element={<RequireAdmin />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OperationsOverviewPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/new" element={<CreateOrderPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/:tripId" element={<TripSummaryPage />} />
          <Route path="/statements" element={<StatementsPage />} />
          <Route path="/statements/:statementId" element={<StatementDetailPage />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/companies/new" element={<CreateCompanyPage />} />
          <Route path="/companies/:companyId" element={<CompanyDetailPage />} />
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/drivers/new" element={<Suspense fallback={<p role="status">Loading driver account form…</p>}><CreateDriverPage /></Suspense>} />
          <Route path="/drivers/:driverId" element={<DriverDetailPage />} />
          {navigationItems.filter((item) => !['/overview', '/orders', '/companies', '/drivers', '/trips', '/statements'].includes(item.path)).map((item) => (
            <Route key={item.path} path={item.path} element={<WorkspaceSectionPage title={item.title} description={item.description} icon={item.icon} />} />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
