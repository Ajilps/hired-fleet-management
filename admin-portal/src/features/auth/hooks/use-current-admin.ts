import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../../shared/api/api-client'
import { getCurrentAdmin } from '../api/current-admin-service'
import { useAuthStore } from '../stores/use-auth-store'
import { isAdminSessionActive } from '../validation/session-validation'

export function useCurrentAdmin() {
  const session = useAuthStore((state) => state.session)
  return useQuery({
    queryKey: ['auth', 'identity', session?.user.email],
    enabled: isAdminSessionActive(session),
    networkMode: 'always',
    queryFn: ({ signal }) => {
      if (!isAdminSessionActive(session)) throw new ApiError(401, 'Sign in again to continue.')
      return getCurrentAdmin(session.accessToken, signal)
    },
    retry: false,
    staleTime: 30_000,
  })
}
