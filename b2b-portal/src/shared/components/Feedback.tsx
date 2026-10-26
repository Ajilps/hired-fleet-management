import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { Icon } from "./Icon";
export function Feedback({
  error,
  onRetry,
  title,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const [now, setNow] = useState(Date.now);
  const until = error instanceof ApiError ? error.retryAt : null;
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  const remaining = until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
  return (
    <div className="feedback" role="alert">
      <span className="feedback-icon">
        <Icon name="clock" />
      </span>
      <div>
        <strong>{title ?? "Unable to load this information"}</strong>
        <p>
          {error instanceof ApiError
            ? error.message
            : "Please check your connection and try again."}
        </p>
        {onRetry && (
          <button
            className="button secondary compact"
            onClick={onRetry}
            disabled={remaining > 0}
          >
            {remaining ? `Try again in ${remaining}s` : "Try again"}
          </button>
        )}
      </div>
    </div>
  );
}
export function Loading({
  label = "Loading your workspace…",
}: {
  label?: string;
}) {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      {label}
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name="orders" size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    received: "Received",
    accepted: "Accepted",
    rejected: "Rejected",
    unassigned: "Awaiting driver",
    assigned: "Assigned",
    ongoing: "Ongoing",
    closed: "Closed",
    published: "Published",
  };
  return (
    <span className={`status-badge status-${status}`}>
      <span />
      {labels[status] ?? status}
    </span>
  );
}
