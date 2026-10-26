import { ApiError } from "../../shared/api/client";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "./auth-store";
export function usePortalQuery<T>(
  key: readonly unknown[],
  load: (token: string, companyId: string, signal: AbortSignal) => Promise<T>,
  options: { live?: boolean | ((data: T | undefined) => boolean) } = {},
) {
  const session = useAuthStore((state) => state.session);
  return useQuery({
    enabled: !!session && !session.user.passwordChangeRequired,
    queryKey: ["partner", session?.user.id, session?.user.companyId, ...key],
    queryFn: ({ signal }) =>
      session
        ? load(session.accessToken, session.user.companyId, signal)
        : Promise.reject(new Error("Session ended")),
    retry: false,
    staleTime: 30_000,
    refetchInterval: options.live ? (query) => {
      const current = useAuthStore.getState();
      if (current.phase !== 'ready' || !current.session || Date.parse(current.session.accessTokenExpiresAt) <= Date.now()) return false;
      if (query.state.error instanceof ApiError && query.state.error.retryAt !== null && query.state.error.retryAt > Date.now()) return false;
      if (typeof options.live === 'function' && !options.live(query.state.data)) return false;
      return 15_000;
    } : false,
    refetchIntervalInBackground: false,
  });
}
