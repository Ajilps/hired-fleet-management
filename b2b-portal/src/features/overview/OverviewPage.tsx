import { Link } from "react-router";
import { useAuthStore } from "../auth";
import { getCompany } from "../company";
import { listOrders, listTrips, RecordTable } from "../operations";
import { listStatements } from "../statements";
import { usePortalQuery } from "../auth";
import {
  Feedback,
  Loading,
  EmptyState,
} from "../../shared/components/Feedback";
import { PageHeader } from "../../shared/components/PageHeader";
import { Icon } from "../../shared/components/Icon";
import type { IconName } from "../../shared/components/Icon";
import { formatDate, formatMoney, monthLabel } from "../../shared/format";
export function OverviewPage() {
  const name = useAuthStore(
    (state) => state.session?.user.fullName ?? "there",
  ).split(" ")[0];
  const company = usePortalQuery(["company"], getCompany);
  const pending = usePortalQuery(
    ["orders", { status: "received" }],
    (token, companyId, signal) =>
      listOrders({ status: "received" }, token, companyId, signal),
    { live: true },
  );
  const ongoing = usePortalQuery(
    ["trips", { status: "ongoing" }],
    (token, companyId, signal) =>
      listTrips({ status: "ongoing" }, token, companyId, signal),
    { live: true },
  );
  const closed = usePortalQuery(
    ["trips", { status: "closed" }],
    (token, companyId, signal) =>
      listTrips({ status: "closed" }, token, companyId, signal),
    { live: true },
  );
  const statements = usePortalQuery(
    ["statements", "", ""],
    (token, companyId, signal) => listStatements({}, token, companyId, signal),
  );
  const metrics = [
    {
      label: "Pending orders",
      note: "Awaiting review",
      query: pending,
      to: "/orders?status=received",
      icon: "orders",
    },
    {
      label: "Ongoing trips",
      note: "Currently on the road",
      query: ongoing,
      to: "/orders?tab=trips&status=ongoing",
      icon: "trips",
    },
    {
      label: "Completed trips",
      note: "Closed journeys",
      query: closed,
      to: "/orders?tab=trips&status=closed",
      icon: "check",
    },
    {
      label: "Published statements",
      note: "Monthly records",
      query: statements,
      to: "/statements",
      icon: "statements",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="YOUR BUSINESS, IN MOTION"
        title={`Hello, ${name}.`}
        description="Here’s where your journeys stand. Let’s keep things moving."
        action={
          <button
            className="button secondary"
            onClick={() => {
              for (const metric of metrics) void metric.query.refetch();
            }}
            disabled={metrics.some((metric) => metric.query.isFetching)}
          >
            <Icon name="refresh" />
            Refresh overview
          </button>
        }
      />
      <section className="welcome-banner">
        <div>
          <span className="pill">
            {company.data?.displayName ?? "YOUR COMPANY WORKSPACE"}
          </span>
          <h2>
            The next journey
            <br />
            starts with a request.
          </h2>
          <p>
            A driver when you need one.
            <br />
            All the details in one place.
          </p>
          <Link className="button primary" to="/orders/new">
            <Icon name="plus" />
            Request a driver
            <Icon name="arrow" size={17} />
          </Link>
        </div>
        <div className="banner-journey" aria-hidden="true">
          <div className="map-dot one">
            <Icon name="company" />
          </div>
          <div className="map-path" />
          <div className="map-car">
            <Icon name="trips" size={42} />
          </div>
          <div className="map-dot two">
            <Icon name="pin" />
          </div>
          <span className="map-caption">A smoother way from A to B.</span>
        </div>
      </section>
      <div className="metrics-grid">
        {metrics.map((metric) => (
          <Link className="metric-card" to={metric.to} key={metric.label}>
            <div className="metric-top">
              <span>{metric.label}</span>
              <span className="metric-icon">
                <Icon name={metric.icon as IconName} />
              </span>
            </div>
            <strong className="metric-value">
              {metric.query.isPending
                ? "…"
                : metric.query.isError
                  ? "—"
                  : metric.query.data.pageInfo.totalCount}
            </strong>
            <span className="metric-note">
              {metric.query.isError ? "Currently unavailable" : metric.note}
              <Icon name="arrow" size={15} />
            </span>
          </Link>
        ))}
      </div>
      <div className="overview-columns">
        <div className="stack">
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>On the road</h2>
                <p>Your ongoing journeys.</p>
              </div>
              <Link className="text-link" to="/orders?tab=trips">
                All trips
                <Icon name="arrow" size={16} />
              </Link>
            </div>
            {ongoing.isPending ? (
              <Loading />
            ) : ongoing.isError ? (
              <Feedback
                error={ongoing.error}
                onRetry={() => void ongoing.refetch()}
                title="Trip updates unavailable"
              />
            ) : (
              <RecordTable
                items={ongoing.data.items.slice(0, 3)}
                kind="trips"
              />
            )}
          </section>
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>Requests in review</h2>
                <p>We’ll keep you posted as things move forward.</p>
              </div>
              <Link className="text-link" to="/orders">
                All orders
                <Icon name="arrow" size={16} />
              </Link>
            </div>
            {pending.isPending ? (
              <Loading />
            ) : pending.isError ? (
              <Feedback
                error={pending.error}
                onRetry={() => void pending.refetch()}
                title="Order updates unavailable"
              />
            ) : (
              <RecordTable
                items={pending.data.items.slice(0, 3)}
                kind="orders"
              />
            )}
          </section>
        </div>
        <div className="stack">
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>Your statements</h2>
                <p>Published monthly records.</p>
              </div>
              <Icon name="statements" />
            </div>
            {statements.isPending ? (
              <Loading />
            ) : statements.isError ? (
              <Feedback
                error={statements.error}
                onRetry={() => void statements.refetch()}
                title="Statements unavailable"
              />
            ) : !statements.data.items.length ? (
              <EmptyState title="A fresh start">
                Your published statements will live here.
              </EmptyState>
            ) : (
              <div className="overview-statements">
                {statements.data.items.slice(0, 3).map((statement) => (
                  <Link key={statement.id} to={`/statements/${statement.id}`}>
                    <span className="statement-icon">
                      <Icon name="statements" />
                    </span>
                    <span>
                      <strong>{monthLabel(statement.periodStart)}</strong>
                      <small>
                        Trip amount · {formatMoney(statement.totalTripAmount)}
                      </small>
                    </span>
                    <Icon name="chevron" size={17} />
                  </Link>
                ))}
              </div>
            )}
            <Link className="card-footer-link" to="/statements">
              View monthly statements
              <Icon name="arrow" size={16} />
            </Link>
          </section>
          <section className="help-card">
            <span className="round-icon">
              <Icon name="shield" />
            </span>
            <h3>Your company. Your records.</h3>
            <p>
              Every request, trip and statement here belongs to your company
              workspace.
            </p>
            <Link className="text-link" to="/company">
              Company details
              <Icon name="arrow" size={16} />
            </Link>
          </section>
        </div>
      </div>
      <p className="workspace-timestamp">
        Times shown in IST ·{" "}
        {ongoing.dataUpdatedAt
          ? `Trips checked ${formatDate(new Date(ongoing.dataUpdatedAt).toISOString())}`
          : "Refresh to check the latest journey updates."}
      </p>
    </>
  );
}
