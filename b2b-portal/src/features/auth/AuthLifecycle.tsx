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
    let isRenewing = false;
    const handleRenew = async () => {
      if (document.hidden || isRenewing) return;
      if (Date.parse(session.accessTokenExpiresAt) - Date.now() > 60_000)
        return;
      isRenewing = true;
      try {
        await restoreAuthentication();
      } finally {
        isRenewing = false;
      }
    };
    const expiry = window.setTimeout(
      () =>
        useAuthStore
          .getState()
          .clear("Your session has ended. Sign in again to continue."),
      Math.max(0, Date.parse(session.accessTokenExpiresAt) - Date.now()),
    );
    const timer = window.setInterval(() => {
      if (Date.parse(session.accessTokenExpiresAt) <= Date.now())
        useAuthStore
          .getState()
          .clear("Your session has ended. Sign in again to continue.");
      else void handleRenew();
    }, 15_000);
    window.addEventListener("focus", handleRenew);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(expiry);
      window.removeEventListener("focus", handleRenew);
    };
  }, [session]);
  return null;
}
