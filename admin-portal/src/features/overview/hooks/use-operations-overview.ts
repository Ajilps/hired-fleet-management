import { useQueries } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { ApiError } from '../../../shared/api/api-client'
import { getOverviewSummary } from '../api/overview-service'
import { overviewSections } from '../types/overview-types'

export function useOperationsOverview() {
  const session = useAuthStore((state) => state.session)
  const queries = useQueries({
    queries: overviewSections.map((section) => ({
      queryKey: ['overview', session?.user.email, 'all-companies', section.key],
      enabled: Boolean(session),
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (!session) throw new ApiError(401, 'Sign in again to continue.')
        return getOverviewSummary(section.key, session.accessToken, signal)
      },
      retry: false,
      networkMode: 'always' as const,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  })

  return {
    sections: overviewSections.map((config, index) => ({ config, query: queries[index] })),
    isRefreshing: queries.some((query) => query.isFetching),
    refresh: () => Promise.all(queries.map((query) => query.refetch({ cancelRefetch: false }))),
  }
}
