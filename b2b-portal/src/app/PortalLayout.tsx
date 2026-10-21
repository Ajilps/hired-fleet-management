import { useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router";
import { useAuthStore } from "../features/auth";
import { signOut } from "../features/auth";
import { getCompany } from "../features/company";
import { usePortalQuery } from "../features/auth";
import { Feedback } from "../shared/components/Feedback";
import { Icon } from "../shared/components/Icon";
import type { IconName } from "../shared/components/Icon";
import logo from "../shared/assets/hired-logo.svg";
const navigation: { label: string; to: string; icon: IconName }[] = [
  { label: "Overview", to: "/", icon: "overview" },
  { label: "Orders & trips", to: "/orders", icon: "trips" },
  { label: "Trip reports", to: "/reports", icon: "orders" },
  { label: "Monthly statements", to: "/statements", icon: "statements" },
  { label: "Company & account", to: "/company", icon: "company" },
];
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main navigation">
      {navigation.map((item) => (
        <NavLink
          end={item.to === "/"}
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
export function PortalLayout() {
  const session = useAuthStore((state) => state.session);
  const navigate = useNavigate();
  const company = usePortalQuery(["company"], getCompany);
  const dialog = useRef<HTMLDialogElement>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!session) return <Navigate to="/login" replace />;
  const initials = session.user.fullName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  async function handleSignOut() {
    if (!session || isSigningOut) return;
    setIsSigningOut(true);
    setError(null);
    try {
      await signOut(session.accessToken);
      useAuthStore.getState().clear("You have signed out.");
      navigate("/login", { replace: true });
    } catch (value) {
      setError(value);
    } finally {
      setIsSigningOut(false);
    }
  }
  const content = (
    <>
      <Link className="brand" to="/" onClick={() => dialog.current?.close()}>
        <img src={logo} alt="HireD" />
        <span>BUSINESS PORTAL</span>
      </Link>
      <div className="sidebar-company">
        <span className="company-avatar">
          <Icon name="company" />
        </span>
        <div>
          <strong>{company.data?.displayName ?? "Your company"}</strong>
          <span>Partner workspace</span>
        </div>
      </div>
      <Link
        className="button primary sidebar-create"
        to="/orders/new"
        onClick={() => dialog.current?.close()}
      >
        <Icon name="plus" />
        New order
      </Link>
      <Navigation onNavigate={() => dialog.current?.close()} />
      <div className="sidebar-bottom">
        <div className="sidebar-assurance">
          <Icon name="shield" size={18} />
          <p>
            Your journeys.
            <br />
            Securely in one place.
          </p>
        </div>
        <div className="sidebar-user">
          <span className="avatar">{initials}</span>
          <div>
            <strong>{session.user.fullName}</strong>
            <small>Business partner</small>
          </div>
        </div>
        <button
          className="signout-button"
          onClick={handleSignOut}
          disabled={isSigningOut}
        >
          <Icon name="logout" size={18} />
          {isSigningOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </>
  );
  return (
    <div className="portal">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">{content}</aside>
      <dialog
        ref={dialog}
        className="mobile-drawer"
        aria-label="Workspace navigation"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="drawer-body">
          <button
            className="drawer-close icon-button"
            aria-label="Close navigation"
            onClick={() => dialog.current?.close()}
          >
            <Icon name="close" />
          </button>
          {content}
        </div>
      </dialog>
      <div className="portal-body">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => dialog.current?.showModal()}
            >
              <Icon name="menu" />
            </button>
            <span className="topbar-label">Your business workspace</span>
          </div>
          <div className="topbar-right">
            <span className="timezone">
              <Icon name="clock" size={15} />
              India Standard Time
            </span>
            <span className="topbar-separator" />
            <Link className="account-link" to="/company">
              <span className="avatar">{initials}</span>
              <span>
                {session.user.fullName.split(" ")[0]}
                <Icon name="chevron" size={14} />
              </span>
            </Link>
          </div>
        </header>
        <main id="main" className="workspace" tabIndex={-1}>
          {error !== null && (
            <Feedback
              error={error}
              onRetry={handleSignOut}
              title="Sign out not completed"
            />
          )}
          <Outlet />
        </main>
        <footer className="portal-footer">
          <span>© {new Date().getFullYear()} HireD</span>
          <span>Business travel, organised.</span>
        </footer>
      </div>
    </div>
  );
}
