import { Navigate, Route, Routes } from 'react-router'
import { AdminLoginPage, RequireAdmin } from '../features/auth'
import { OperationsOverviewPage } from '../features/overview'
import { OrdersPage, CreateOrderPage, OrderDetailPage } from '../features/orders'
import { TripSummaryPage } from '../features/trips'
import { AdminLayout } from './layout/AdminLayout'
import { navigationItems } from './layout/navigation-items'
import { WorkspaceSectionPage } from './pages/WorkspaceSectionPage'
import { NotFoundPage } from './pages/NotFoundPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLoginPage />} />
      <Route element={<RequireAdmin />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OperationsOverviewPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/new" element={<CreateOrderPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/trips/:tripId" element={<TripSummaryPage />} />
          {navigationItems.filter((item) => !['/overview', '/orders'].includes(item.path)).map((item) => (
            <Route key={item.path} path={item.path} element={<WorkspaceSectionPage title={item.title} description={item.description} icon={item.icon} />} />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
