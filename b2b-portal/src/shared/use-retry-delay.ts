import { useEffect, useState } from "react";
import { ApiError } from "./api/client";
export function useRetryDelay(error: unknown) {
  const [now, setNow] = useState(Date.now);
  const until = error instanceof ApiError ? error.retryAt : null;
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}
