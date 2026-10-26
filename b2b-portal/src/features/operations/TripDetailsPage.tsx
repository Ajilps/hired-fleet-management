import { Link, useParams } from "react-router";
import { getExpenses, getTrip } from "./operation-service";
import { usePortalQuery } from "../auth";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  Loading,
  Feedback,
  StatusBadge,
} from "../../shared/components/Feedback";
import { formatDate, formatMoney, shortId } from "../../shared/format";
import { RouteSummary } from "./components/RouteSummary";
import { CloseCode } from "./components/CloseCode";
import { Icon } from "../../shared/components/Icon";
function Expenses({ tripId, isLive }: { tripId: string; isLive: boolean }) {
  const query = usePortalQuery(
    ["expenses", tripId],
    (token, _company, signal) => getExpenses(tripId, token, signal),
    { live: isLive },
  );
  return (
    <section className="card detail-card">
      <div className="card-title">
        <h2>Trip expenses</h2>
        <button className="button secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh expenses</button>
        {query.data && <strong>{formatMoney(query.data.total)}</strong>}
      </div>
      <p className="muted">
        Recorded separately from the trip amount and commission.
      </p>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.items.length ? (
        <ul className="expense-list">
          {query.data.items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.description}</strong>
                <small>
                  {item.category} · {formatDate(item.loggedAt)}
                </small>
              </div>
              <strong>{formatMoney(item.amount)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small-note">No expenses recorded.</p>
      )}
    </section>
  );
}
export function TripDetailsPage() {
  const tripId = useParams().tripId!;
  const query = usePortalQuery(["trips", tripId], (token, companyId, signal) =>
    getTrip(tripId, token, companyId, signal),
    { live: data => data?.status !== 'closed' },
  );
  const trip = query.data;
  return (
    <>
      <Link className="back-link" to="/orders?tab=trips">
        ← Orders & trips
      </Link>
      <PageHeader
        eyebrow="TRIP DETAILS"
        title={`TRP-${shortId(tripId)}`}
        description="A clear view of your journey, from assignment to completion."
        action={
          <button
            className="button secondary"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <Icon name="refresh" />
            Refresh trip
          </button>
        }
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError || !trip ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="trip-progress" aria-label="Trip progress">
            {["unassigned", "assigned", "ongoing", "closed"].map(
              (status, index) => (
                <div
                  key={status}
                  className={
                    index <=
                    ["unassigned", "assigned", "ongoing", "closed"].indexOf(
                      trip.status,
                    )
                      ? "complete"
                      : ""
                  }
                >
                  <span>
                    {index <
                    ["unassigned", "assigned", "ongoing", "closed"].indexOf(
                      trip.status,
                    ) ? (
                      <Icon name="check" size={14} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {
                    ["Accepted", "Driver assigned", "On the road", "Completed"][
                      index
                    ]
                  }
                </div>
              ),
            )}
          </div>
          <div className="detail-layout">
            <div className="stack">
              <section className="card detail-card">
                <div className="card-title">
                  <h2>Your journey</h2>
                  <StatusBadge status={trip.status} />
                </div>
                <RouteSummary pickup={trip.pickup} drop={trip.drop} />
                <dl className="detail-grid">
                  <div>
                    <dt>Scheduled pickup</dt>
                    <dd>{formatDate(trip.scheduledPickupAt)}</dd>
                  </div>
                  <div>
                    <dt>Trip amount</dt>
                    <dd className="amount">{formatMoney(trip.totalAmount)}</dd>
                  </div>
                  <div>
                    <dt>Contact</dt>
                    <dd>
                      {trip.contact.name}
                      <br />
                      {trip.contact.phone}
                    </dd>
                  </div>
                  <div>
                    <dt>Estimated duration</dt>
                    <dd>
                      {trip.estimate.durationMinutes
                        ? `${trip.estimate.durationMinutes} minutes${trip.estimate.source === "distance_heuristic" ? " · rough estimate" : ""}`
                        : "Estimate unavailable"}
                    </dd>
                  </div>
                  <div>
                    <dt>Vehicle notes</dt>
                    <dd>{trip.vehicleNotes ?? "Not provided"}</dd>
                  </div>
                  <div>
                    <dt>Service notes</dt>
                    <dd>{trip.serviceNotes ?? "Not provided"}</dd>
                  </div>
                  <div>
                    <dt>Started</dt>
                    <dd>{formatDate(trip.startedAt)}</dd>
                  </div>
                  <div>
                    <dt>Closed</dt>
                    <dd>{formatDate(trip.closedAt)}</dd>
                  </div>
                </dl>
                <p className="small-note">
                  Last record update: {formatDate(trip.updatedAt)}
                </p>
              </section>
              <Expenses tripId={tripId} isLive={trip.status !== "closed"} />
            </div>
            <aside className="stack">
              <section className="card detail-card">
                <h2>Your driver</h2>
                {trip.currentDriver ? (
                  <>
                    <span className="driver-avatar">
                      {trip.currentDriver.fullName
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <h3>{trip.currentDriver.fullName}</h3>
                    <p className="muted">Assigned to this trip</p>
                    {trip.currentDriver.phone && (
                      <a
                        className="button secondary"
                        href={`tel:${trip.currentDriver.phone.replace(/[^+0-9]/g, "")}`}
                      >
                        {trip.currentDriver.phone}
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    <span className="round-icon">
                      <Icon name="trips" />
                    </span>
                    <h3>Finding the right driver.</h3>
                    <p className="muted">
                      Your driver details will appear here after assignment.
                    </p>
                  </>
                )}
              </section>
              {trip.status === "ongoing" && (
                <CloseCode key={`${tripId}:${trip.status}`} tripId={tripId} />
              )}
              {trip.status === "closed" && (
                <section className="card detail-card">
                  <span className="round-icon success">
                    <Icon name="check" />
                  </span>
                  <h2>Journey completed.</h2>
                  <p className="muted">
                    Your frozen trip report contains the recorded split, shares
                    and expenses at closure.
                  </p>
                  <Link className="button secondary" to="/reports">
                    Browse trip reports
                    <Icon name="arrow" size={18} />
                  </Link>
                </section>
              )}
              <Link className="subtle-link" to={`/orders/${trip.orderId}`}>
                View original order
                <Icon name="arrow" size={16} />
              </Link>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
