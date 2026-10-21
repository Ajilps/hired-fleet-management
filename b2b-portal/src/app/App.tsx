import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ApiError } from "../shared/api/client";
import {
  useAuthStore,
  AuthLifecycle,
  LoginPage,
  ChangePasswordPage,
  restoreAuthentication,
} from "../features/auth";
import { OverviewPage } from "../features/overview";
import {
  RecordsPage,
  NewOrderPage,
  OrderDetailsPage,
  TripDetailsPage,
} from "../features/operations";
import {
  ReportsPage,
  ReportDetailsPage,
  StatementsPage,
  StatementDetailsPage,
} from "../features/statements";
import { CompanyPage } from "../features/company";
import { Loading } from "../shared/components/Feedback";
import { PortalLayout } from "./PortalLayout";
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError(error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.code === "PASSWORD_CHANGE_REQUIRED")
      )
        useAuthStore.getState().clear(error.message);
    },
  }),
  defaultOptions: {
    queries: { retry: false, gcTime: 5 * 60_000, refetchOnWindowFocus: true },
  },
});
function RequirePartner({
  allowRestricted = false,
}: {
  allowRestricted?: boolean;
}) {
  const session = useAuthStore((state) => state.session);
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.passwordChangeRequired && !allowRestricted)
    return <Navigate to="/change-password" replace />;
  return <Outlet />;
}
function PortalRoutes() {
  const phase = useAuthStore((state) => state.phase);
  const session = useAuthStore((state) => state.session);
  if (phase === "restoring")
    return (
      <div className="full-screen-state">
        <Loading label="Opening your workspace…" />
      </div>
    );
  if (phase === "error")
    return (
      <div className="full-screen-state">
        <section className="card detail-card">
          <h1>Let’s reconnect.</h1>
          <p>
            We couldn’t restore your session. Check your connection and try
            again.
          </p>
          <button
            className="button primary"
            onClick={() => void restoreAuthentication()}
          >
            Try again
          </button>
          <button
            className="button secondary"
            onClick={() => useAuthStore.getState().clear()}
          >
            Go to sign in
          </button>
        </section>
      </div>
    );
  return (
    <Routes>
      <Route
        path="/login"
        element={
          session ? (
            <Navigate
              to={
                session.user.passwordChangeRequired ? "/change-password" : "/"
              }
              replace
            />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route element={<RequirePartner allowRestricted />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
      </Route>
      <Route element={<RequirePartner />}>
        <Route element={<PortalLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="orders" element={<RecordsPage />} />
          <Route path="orders/new" element={<NewOrderPage />} />
          <Route path="orders/:orderId" element={<OrderDetailsPage />} />
          <Route path="trips/:tripId" element={<TripDetailsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/:reportId" element={<ReportDetailsPage />} />
          <Route path="statements" element={<StatementsPage />} />
          <Route
            path="statements/:statementId"
            element={<StatementDetailsPage />}
          />
          <Route path="company" element={<CompanyPage />} />
          <Route
            path="*"
            element={
              <section className="card empty-state">
                <h1>We couldn’t find that page.</h1>
                <p>Head back to your workspace to keep moving.</p>
                <Link className="button primary" to="/">
                  Back to overview
                </Link>
              </section>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthLifecycle />
      <BrowserRouter>
        <PortalRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
