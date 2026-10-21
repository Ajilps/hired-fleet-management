import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "./auth-store";
export function usePortalQuery<T>(
  key: readonly unknown[],
  load: (token: string, companyId: string, signal: AbortSignal) => Promise<T>,
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
  });
}
