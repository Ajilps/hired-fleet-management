import { Link, useLocation, useParams } from "react-router";
import { getOrder } from "./operation-service";
import { usePortalQuery } from "../auth";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  Loading,
  Feedback,
  StatusBadge,
} from "../../shared/components/Feedback";
import { formatDate, shortId } from "../../shared/format";
import { RouteSummary } from "./components/RouteSummary";
import { Icon } from "../../shared/components/Icon";
export function OrderDetailsPage() {
  const orderId = useParams().orderId!;
  const location = useLocation();
  const query = usePortalQuery(
    ["orders", orderId],
    (token, companyId, signal) => getOrder(orderId, token, companyId, signal),
  );
  return (
    <>
      <Link className="back-link" to="/orders">
        ← Orders & trips
      </Link>
      <PageHeader
        eyebrow="ORDER DETAILS"
        title={`ORD-${shortId(orderId)}`}
        description="Your request, its details and the latest decision."
        action={
          <button
            className="button secondary"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <Icon name="refresh" />
            Refresh order
          </button>
        }
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {location.state?.isCreated && (
            <p className="notice success" role="status">
              Request received. HireD will review it and confirm the next steps.
            </p>
          )}
          <div className="detail-layout">
            <section className="card detail-card">
              <div className="card-title">
                <h2>Journey details</h2>
                <StatusBadge status={query.data.status} />
              </div>
              <RouteSummary pickup={query.data.pickup} drop={query.data.drop} />
              <dl className="detail-grid">
                <div>
                  <dt>Requested pickup</dt>
                  <dd>{formatDate(query.data.requestedPickupAt)}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>
                    {query.data.contact.name}
                    <br />
                    {query.data.contact.phone}
                  </dd>
                </div>
                <div>
                  <dt>Vehicle notes</dt>
                  <dd>{query.data.vehicleNotes ?? "Not provided"}</dd>
                </div>
                <div>
                  <dt>Service notes</dt>
                  <dd>{query.data.serviceNotes ?? "Not provided"}</dd>
                </div>
                <div>
                  <dt>Estimated duration</dt>
                  <dd>
                    {query.data.estimate.durationMinutes
                      ? `${query.data.estimate.durationMinutes} minutes${query.data.estimate.source === "distance_heuristic" ? " · rough distance estimate" : ""}`
                      : "Estimate unavailable"}
                  </dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>{formatDate(query.data.createdAt)}</dd>
                </div>
              </dl>
            </section>
            <aside className="card detail-card">
              <span className="round-icon">
                <Icon
                  name={query.data.status === "accepted" ? "check" : "clock"}
                />
              </span>
              <h2>
                {query.data.status === "received"
                  ? "Your request is with us."
                  : query.data.status === "accepted"
                    ? "Your journey is taking shape."
                    : "This request was declined."}
              </h2>
              <p className="muted">
                {query.data.status === "received"
                  ? "HireD is reviewing the details. Refresh this page to check for updates."
                  : query.data.status === "accepted"
                    ? "A trip has been created. Driver assignment is the next step."
                    : query.data.rejectionReason}
              </p>
              {query.data.tripId && (
                <Link
                  className="button primary"
                  to={`/trips/${query.data.tripId}`}
                >
                  View trip
                  <Icon name="arrow" />
                </Link>
              )}
              <p className="small-note">
                The saved decision is shown here. Email delivery is separate.
              </p>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
