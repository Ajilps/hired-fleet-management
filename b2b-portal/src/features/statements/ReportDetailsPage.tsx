import { Link, useParams } from "react-router";
import { usePortalQuery } from "../auth";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  Feedback,
  Loading,
  StatusBadge,
} from "../../shared/components/Feedback";
import { formatDate, formatMoney, shortId } from "../../shared/format";
import { RouteSummary } from "../operations";
import { getReport } from "./statement-service";
export function ReportDetailsPage() {
  const reportId = useParams().reportId!;
  const query = usePortalQuery(
    ["reports", reportId],
    (token, companyId, signal) => getReport(reportId, token, companyId, signal),
  );
  const report = query.data;
  return (
    <>
      <Link className="back-link" to="/reports">
        ← Trip reports
      </Link>
      <PageHeader
        eyebrow="CLOSED-TRIP REPORT"
        title={report ? `TRP-${shortId(report.tripId)}` : "Trip report"}
        description="The recorded journey and financials, preserved at closure."
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError || !report ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <section className="card detail-card">
            <div className="card-title">
              <h2>Journey summary</h2>
              <StatusBadge status="closed" />
            </div>
            <RouteSummary pickup={report.pickup} drop={report.drop} />
            <dl className="detail-grid">
              <div>
                <dt>Driver at closure</dt>
                <dd>{report.driver}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{formatDate(report.startedAt)}</dd>
              </div>
              <div>
                <dt>Closed</dt>
                <dd>{formatDate(report.closedAt)}</dd>
              </div>
              <div>
                <dt>Report generated</dt>
                <dd>{formatDate(report.generatedAt)}</dd>
              </div>
            </dl>
          </section>
          <section className="card detail-card">
            <h2>Recorded trip financials</h2>
            <div className="financial-summary">
              <div>
                <span>Trip amount</span>
                <strong>{formatMoney(report.amounts.tripAmount)}</strong>
              </div>
              <div>
                <span>
                  Driver share · {report.amounts.appliedDriverPercent}%
                </span>
                <strong>{formatMoney(report.amounts.driverShareAmount)}</strong>
              </div>
              <div>
                <span>
                  Company share · {report.amounts.appliedCompanyPercent}%
                </span>
                <strong>
                  {formatMoney(report.amounts.companyShareAmount)}
                </strong>
              </div>
            </div>
            <p className="small-note">
              These are recorded values at closure. Later rate changes do not
              alter this report. Payments are handled offline.
            </p>
          </section>
          <section className="card detail-card">
            <div className="card-title">
              <h2>Expenses · separate from commission</h2>
              <strong>{formatMoney(report.totalExpenses)}</strong>
            </div>
            {report.expenses.length ? (
              <ul className="expense-list">
                {report.expenses.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.description}</strong>
                      <small>{item.category}</small>
                    </div>
                    <strong>{formatMoney(item.amount)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No expenses recorded.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
