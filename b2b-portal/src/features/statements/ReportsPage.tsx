import { Link, useSearchParams } from "react-router";
import { usePortalQuery } from "../auth";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  Feedback,
  Loading,
  EmptyState,
} from "../../shared/components/Feedback";
import { formatDate, shortId } from "../../shared/format";
import { Icon } from "../../shared/components/Icon";
import { listReports } from "./statement-service";
export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const cursor = params.get("cursor") ?? "";
  const query = usePortalQuery(
    ["reports", cursor],
    (token, companyId, signal) => listReports(cursor, token, companyId, signal),
  );
  return (
    <>
      <PageHeader
        eyebrow="THE COMPLETE PICTURE"
        title="Trip reports"
        description="Frozen records of completed trips, with expenses and recorded shares."
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
      <section className="card">
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <Feedback error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <div className="list-summary">
              {query.data.pageInfo.totalCount} completed trip reports
            </div>
            {query.data.items.length ? (
              query.data.items.map((item) => (
                <Link
                  className="report-row"
                  key={item.id}
                  to={`/reports/${item.id}`}
                >
                  <span className="statement-icon">
                    <Icon name="statements" />
                  </span>
                  <div>
                    <strong>TRP-{shortId(item.tripId)}</strong>
                    <small>Closed {formatDate(item.closedAt)}</small>
                  </div>
                  <span className="text-link">
                    View report
                    <Icon name="arrow" size={16} />
                  </span>
                </Link>
              ))
            ) : (
              <EmptyState title="Your next chapter starts here">
                Completed-trip reports will appear here after a journey is
                closed.
              </EmptyState>
            )}
            <div className="pagination">
              <span>Up to 25 reports per page</span>
              {cursor && (
                <button
                  className="button secondary compact"
                  onClick={() => setParams({})}
                >
                  First page
                </button>
              )}
              {query.data.pageInfo.hasMore && (
                <button
                  className="button secondary compact"
                  onClick={() =>
                    setParams({ cursor: query.data.pageInfo.nextCursor! })
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
