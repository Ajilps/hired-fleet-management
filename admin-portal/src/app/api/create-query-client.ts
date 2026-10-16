import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../features/auth'
import { ApiError } from '../../shared/api/api-client'

export function createQueryClient() {
  function handleRequestError(error: Error) {
    if (!(error instanceof ApiError) || error.status !== 401) return
    void queryClient.cancelQueries()
    queryClient.removeQueries()
    useAuthStore.getState().clearSession(true)
  }

  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleRequestError }),
    mutationCache: new MutationCache({ onError: handleRequestError }),
    defaultOptions: {
      queries: { staleTime: 30_000, retry: false },
      mutations: { retry: false },
    },
  })
  return queryClient
}
