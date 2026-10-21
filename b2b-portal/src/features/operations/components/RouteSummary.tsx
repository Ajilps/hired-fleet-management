import { Icon } from "../../../shared/components/Icon";
export function RouteSummary({
  pickup,
  drop,
}: {
  pickup: string;
  drop: string;
}) {
  return (
    <div className="route-summary">
      <div>
        <span className="route-dot" />
        <span>
          <small>Pickup</small>
          {pickup}
        </span>
      </div>
      <div className="route-connector" />
      <div>
        <Icon name="pin" size={15} />
        <span>
          <small>Destination</small>
          {drop}
        </span>
      </div>
    </div>
  );
}
