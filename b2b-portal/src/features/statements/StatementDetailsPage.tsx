import { Link, useParams } from "react-router";
import { usePortalQuery } from "../auth";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  Feedback,
  Loading,
  StatusBadge,
} from "../../shared/components/Feedback";
import {
  formatDate,
  formatMoney,
  monthLabel,
  shortId,
} from "../../shared/format";
import { getStatement } from "./statement-service";
export function StatementDetailsPage() {
  const statementId = useParams().statementId!;
  const query = usePortalQuery(
    ["statements", statementId],
    (token, companyId, signal) =>
      getStatement(statementId, token, companyId, signal),
  );
  const statement = query.data;
  return (
    <>
      <Link className="back-link" to="/statements">
        ← Monthly statements
      </Link>
      <PageHeader
        eyebrow="MONTHLY STATEMENT"
        title={
          statement ? monthLabel(statement.periodStart) : "Statement details"
        }
        description="A published, frozen record of your completed journeys."
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError || !statement ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <section className="card detail-card">
            <div className="card-title">
              <div>
                <p className="eyebrow">STMT-{shortId(statement.id)}</p>
                <h2>{monthLabel(statement.periodStart)}</h2>
              </div>
              <StatusBadge status="published" />
            </div>
            <p className="muted">
              {statement.periodStart} to {statement.periodEnd} (exclusive) ·
              Asia/Kolkata
              <br />
              Published {formatDate(statement.publishedAt)} · Version{" "}
              {statement.contentVersion}
            </p>
            <div className="financial-summary">
              <div>
                <span>Trip amount</span>
                <strong>{formatMoney(statement.totalTripAmount)}</strong>
              </div>
              <div>
                <span>Driver share</span>
                <strong>{formatMoney(statement.totalDriverShare)}</strong>
              </div>
              <div>
                <span>Company share</span>
                <strong>{formatMoney(statement.totalCompanyShare)}</strong>
              </div>
            </div>
            <p className="small-note">
              Recorded splits are fixed at each trip’s closure. Expenses are
              separate. Payments are handled offline.
            </p>
          </section>
          <section className="card detail-card">
            <h2>
              Trip-wise breakdown{" "}
              <span className="count-label">
                {statement.items.length} trips
              </span>
            </h2>
            <div
              className="table-scroll"
              role="region"
              aria-label="Statement trip amounts"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Trip</th>
                    <th>Trip amount</th>
                    <th>Driver split</th>
                    <th>Driver share</th>
                    <th>Company share</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.items.map((item) => (
                    <tr key={item.tripId}>
                      <td>
                        <Link to={`/trips/${item.tripId}`}>
                          TRP-{shortId(item.tripId)}
                        </Link>
                      </td>
                      <td>{formatMoney(item.tripAmount)}</td>
                      <td>{item.appliedDriverPercent}%</td>
                      <td>{formatMoney(item.driverShareAmount)}</td>
                      <td>{formatMoney(item.companyShareAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!statement.items.length && (
              <p className="small-note">
                No trip lines in this published statement.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
