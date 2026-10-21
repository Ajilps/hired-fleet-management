import { Link, Navigate } from "react-router";
import { getCompany } from "./company-service";
import { useAuthStore } from "../auth";
import { usePortalQuery } from "../auth";
import { PageHeader } from "../../shared/components/PageHeader";
import { Feedback, Loading } from "../../shared/components/Feedback";
import { Icon } from "../../shared/components/Icon";
export function CompanyPage() {
  const session = useAuthStore((state) => state.session);
  const query = usePortalQuery(["company"], getCompany);
  if (!session) return <Navigate to="/login" replace />;
  return (
    <>
      <PageHeader
        eyebrow="YOUR WORKSPACE"
        title="Company & account"
        description="The company behind every journey. Your details, in one place."
        action={
          <button
            className="button secondary"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <Icon name="refresh" />
            Refresh details
          </button>
        }
      />
      <div className="detail-layout">
        <section className="card detail-card">
          <h2>Company details</h2>
          {query.isPending ? (
            <Loading />
          ) : query.isError ? (
            <Feedback
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : (
            <>
              <div className="company-profile">
                <span className="company-mark">
                  <Icon name="company" size={30} />
                </span>
                <div>
                  <h3>{query.data.displayName}</h3>
                  <span
                    className={`company-state ${query.data.isActive ? "enabled" : ""}`}
                  >
                    {query.data.isActive
                      ? "Active company"
                      : "Inactive company"}
                  </span>
                </div>
              </div>
              <dl className="detail-grid">
                <div>
                  <dt>Legal name</dt>
                  <dd>{query.data.legalName}</dd>
                </div>
                <div>
                  <dt>Primary contact</dt>
                  <dd>{query.data.contactName}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{query.data.contactEmail}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{query.data.contactPhone}</dd>
                </div>
                <div className="full-width">
                  <dt>Billing address</dt>
                  <dd>{query.data.billingAddress}</dd>
                </div>
              </dl>
              {!query.data.isActive && (
                <p className="notice warning">
                  New orders may be unavailable while your company is inactive.
                  Existing records remain accessible.
                </p>
              )}
              <p className="small-note">
                Contact your HireD administrator to update company or billing
                details.
              </p>
            </>
          )}
        </section>
        <section className="card detail-card">
          <span className="round-icon">
            <Icon name="shield" />
          </span>
          <h2>Your account</h2>
          <dl className="detail-grid single-column">
            <div>
              <dt>Name</dt>
              <dd>{session.user.fullName}</dd>
            </div>
            <div>
              <dt>Work email</dt>
              <dd>{session.user.email}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>Business partner · your company only</dd>
            </div>
          </dl>
          <Link className="button secondary" to="/change-password">
            Change password
            <Icon name="arrow" size={16} />
          </Link>
          <p className="small-note">
            Changing your password signs out all your devices.
          </p>
        </section>
      </div>
    </>
  );
}
