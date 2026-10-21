import { Link, useSearchParams } from "react-router";
import { usePortalQuery } from "../auth";
import { listOrders, listTrips } from "./operation-service";
import type { Order, Trip } from "./operation-service";
import type { Page } from "../../shared/api/validation";
import { RecordTable } from "./components/RecordTable";
import { PageHeader } from "../../shared/components/PageHeader";
import { Feedback, Loading } from "../../shared/components/Feedback";
import { isCalendarDate } from "../../shared/format";
import { Icon } from "../../shared/components/Icon";
const orderStatuses = ["received", "accepted", "rejected"];
const tripStatuses = ["unassigned", "assigned", "ongoing", "closed"];
export function RecordsPage() {
  const [params, setParams] = useSearchParams();
  const kind = params.get("tab") === "trips" ? "trips" : "orders";
  const options = kind === "orders" ? orderStatuses : tripStatuses;
  const status = options.includes(params.get("status") ?? "")
    ? params.get("status")!
    : "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const cursor = params.get("cursor") ?? "";
  const areDatesValid =
    (!from || isCalendarDate(from)) &&
    (!to || isCalendarDate(to)) &&
    (!from || !to || from <= to);
  const filters = areDatesValid
    ? { status, from, to, cursor }
    : { status, cursor };
  const data = usePortalQuery<Page<Order | Trip>>(
    [kind, filters],
    (token, companyId, signal) =>
      kind === "orders"
        ? listOrders(filters, token, companyId, signal)
        : listTrips(filters, token, companyId, signal),
  );
  function handleFilter(name: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete("cursor");
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next);
  }
  return (
    <>
      <PageHeader
        eyebrow="YOUR JOURNEYS"
        title="Orders & trips"
        description="From the first request to the final drop. Everything, in one place."
        action={
          <Link className="button primary" to="/orders/new">
            <Icon name="plus" />
            New order
          </Link>
        }
      />
      <section className="card">
        <div className="tabs" aria-label="View orders or trips">
          {(["orders", "trips"] as const).map((tab) => (
            <button
              key={tab}
              className={kind === tab ? "tab active" : "tab"}
              aria-current={kind === tab ? "page" : undefined}
              onClick={() => setParams({ tab })}
            >
              {tab === "orders" ? "Orders" : "Trips"}
            </button>
          ))}
        </div>
        <form
          className="filter-bar"
          onSubmit={(event) => event.preventDefault()}
        >
          <label>
            Status
            <select
              value={status}
              onChange={(event) => handleFilter("status", event.target.value)}
            >
              <option value="">All statuses</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option[0].toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {kind === "orders" ? "Created from" : "Scheduled from"}
            <input
              aria-label="From date"
              type="date"
              value={from}
              onChange={(event) => handleFilter("from", event.target.value)}
            />
          </label>
          <label>
            To date · inclusive
            <input
              aria-label="To date"
              type="date"
              value={to}
              onChange={(event) => handleFilter("to", event.target.value)}
            />
          </label>
          <button
            type="button"
            className="text-button"
            onClick={() => setParams({ tab: kind })}
          >
            Clear filters
          </button>
          <button
            type="button"
            className="button secondary compact filter-refresh"
            onClick={() => void data.refetch()}
            disabled={data.isFetching}
          >
            <Icon name="refresh" />
            Refresh
          </button>
        </form>
        {!areDatesValid && (
          <p className="field-error card-inset" role="alert">
            Choose a valid date range with the end on or after the start. The
            invalid date filter has not been applied.
          </p>
        )}
        {data.isPending ? (
          <Loading />
        ) : data.isError ? (
          <Feedback error={data.error} onRetry={() => void data.refetch()} />
        ) : (
          <>
            <div className="list-summary">
              <span>
                {data.data.pageInfo.totalCount} {kind} matching your filters
              </span>
              <span>
                {data.isFetching ? "Updating…" : "Company records only"}
              </span>
            </div>
            <RecordTable items={data.data.items} kind={kind} />
            <div className="pagination">
              <span>Up to 25 records per page</span>
              {cursor && (
                <button
                  className="button secondary compact"
                  onClick={() => handleFilter("cursor", "")}
                >
                  First page
                </button>
              )}
              {data.data.pageInfo.hasMore && (
                <button
                  className="button secondary compact"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set("cursor", data.data.pageInfo.nextCursor!);
                    setParams(next);
                  }}
                >
                  Next page
                  <Icon name="arrow" size={16} />
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
}
