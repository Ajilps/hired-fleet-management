import { Link } from "react-router";
import { formatDate, shortId } from "../../../shared/format";
import { StatusBadge, EmptyState } from "../../../shared/components/Feedback";
import { Icon } from "../../../shared/components/Icon";
import type { Order, Trip } from "../operation-service";
export function RecordTable({
  items,
  kind,
}: {
  items: (Order | Trip)[];
  kind: "orders" | "trips";
}) {
  if (!items.length)
    return (
      <EmptyState
        title={kind === "orders" ? "No orders to show" : "No trips to show"}
      >
        {kind === "orders"
          ? "Your submitted requests will appear here. Try another filter or create your first order."
          : "Trips appear after HireD accepts your order. Try another filter to find earlier trips."}
      </EmptyState>
    );
  return (
    <div className="record-table">
      <div className="record-table-heading">
        <span>Reference & route</span>
        <span>Pickup schedule</span>
        <span>Status</span>
        <span />
      </div>
      {items.map((item) => (
        <Link className="record-row" to={`/${kind}/${item.id}`} key={item.id}>
          <div>
            <span className="record-id">
              {kind === "orders" ? "ORD" : "TRP"}-{shortId(item.id)}
            </span>
            <strong>{item.pickup}</strong>
            <span className="record-destination">
              <Icon name="arrow" size={14} />
              {item.drop}
            </span>
          </div>
          <span className="record-schedule">
            {formatDate(
              "requestedPickupAt" in item
                ? item.requestedPickupAt
                : item.scheduledPickupAt,
            )}
          </span>
          <span>
            <StatusBadge status={item.status} />
          </span>
          <Icon name="chevron" size={18} />
        </Link>
      ))}
    </div>
  );
}
