import { Link, useSearchParams } from "react-router";
import { usePortalQuery } from "../auth";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  Feedback,
  Loading,
  EmptyState,
  StatusBadge,
} from "../../shared/components/Feedback";
import { Icon } from "../../shared/components/Icon";
import { formatDate, formatMoney, monthLabel } from "../../shared/format";
import { listStatements } from "./statement-service";
export function StatementsPage() {
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("month") ?? "")
    ? params.get("month")!
    : "";
  const cursor = params.get("cursor") ?? "";
  const query = usePortalQuery(
    ["statements", month, cursor],
    (token, companyId, signal) =>
      listStatements({ month, cursor }, token, companyId, signal),
  );
  return (
    <>
      <PageHeader
        eyebrow="YOUR MONTH, RECONCILED"
        title="Monthly statements"
        description="Published records of completed journeys. Ready when you need them."
        action={
          <button
            className="button secondary"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <Icon name="refresh" />
            Refresh
          </button>
        }
      />
      <div className="notice statement-note">
        <Icon name="shield" />
        <span>
          Only published statements appear here. Figures are recorded at trip
          closure; payments are handled offline.
        </span>
      </div>
      <section className="card">
        <div className="filter-bar">
          <label>
            Billing month · IST
            <input
              type="month"
              value={month}
              onChange={(event) =>
                setParams(
                  event.target.value ? { month: event.target.value } : {},
                )
              }
            />
          </label>
          <button className="text-button" onClick={() => setParams({})}>
            Clear filter
          </button>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <Feedback error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <div className="list-summary">
              {query.data.pageInfo.totalCount} published statements
            </div>
            {query.data.items.length ? (
              <div className="statement-list">
                {query.data.items.map((item) => (
                  <Link
                    className="statement-row"
                    key={item.id}
                    to={`/statements/${item.id}`}
                  >
                    <span className="statement-icon">
                      <Icon name="statements" size={24} />
                    </span>
                    <div>
                      <strong>{monthLabel(item.periodStart)}</strong>
                      <small>
                        Published {formatDate(item.publishedAt, true)}
                      </small>
                    </div>
                    <StatusBadge status="published" />
                    <div className="statement-amount">
                      <small>Trip amount</small>
                      <strong>{formatMoney(item.totalTripAmount)}</strong>
                    </div>
                    <Icon name="chevron" size={18} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No published statements yet">
                Your monthly records will appear here after HireD publishes
                them. Try clearing the month filter.
              </EmptyState>
            )}
            <div className="pagination">
              <span>Up to 25 statements per page</span>
              {cursor && (
                <button
                  className="button secondary compact"
                  onClick={() => setParams(month ? { month } : {})}
                >
                  First page
                </button>
              )}
              {query.data.pageInfo.hasMore && (
                <button
                  className="button secondary compact"
                  onClick={() =>
                    setParams({
                      ...(month ? { month } : {}),
                      cursor: query.data.pageInfo.nextCursor!,
                    })
                  }
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
