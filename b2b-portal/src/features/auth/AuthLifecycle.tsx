import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { restoreAuthentication } from "./restore-authentication";
import { useAuthStore } from "./auth-store";
export function AuthLifecycle() {
  const session = useAuthStore((state) => state.session);
  const client = useQueryClient();
  useEffect(
    () =>
      useAuthStore.subscribe((next, previous) => {
        if (next.phase === "restoring" && previous.phase !== "restoring")
          void client.cancelQueries();
        if (
          next.session?.user.id !== previous.session?.user.id ||
          next.session?.user.companyId !== previous.session?.user.companyId
        ) {
          void client.cancelQueries();
          client.clear();
        }
      }),
    [client],
  );
  useEffect(() => {
    void restoreAuthentication();
  }, []);
  useEffect(() => {
    if (!session) return;
    let attemptedRenewal = false;
    let isRenewing = false;
    const expiresAt = Date.parse(session.accessTokenExpiresAt);
    const handleRenew = async () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        // Hide protected routes while retaining the renewable cookie session.
        if (attemptedRenewal && !isRenewing) {
          if (useAuthStore.getState().phase === "ready")
            useAuthStore.getState().restoreError();
        } else useAuthStore.getState().beginRestore();
      }
      if (document.hidden || attemptedRenewal || remaining > 60_000) return;
      // An uncertain rotation is retried only through the reconnect screen.
      attemptedRenewal = true;
      isRenewing = true;
      try { await restoreAuthentication(); }
      finally { isRenewing = false; }
    };
    const expiry = window.setTimeout(
      () => void handleRenew(),
      Math.max(0, expiresAt - Date.now()),
    );
    const timer = window.setInterval(() => void handleRenew(), 15_000);
    window.addEventListener("focus", handleRenew);
    document.addEventListener("visibilitychange", handleRenew);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(expiry);
      window.removeEventListener("focus", handleRenew);
      document.removeEventListener("visibilitychange", handleRenew);
    };
  }, [session]);
  return null;
}
