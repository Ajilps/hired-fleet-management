import type { QueryClient } from '@tanstack/react-query'
import { createQueryClient } from '../app/api/create-query-client'

const queryClients: QueryClient[] = []

export function createTestQueryClient() {
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } })
  queryClients.push(queryClient)
  return queryClient
}

export function clearTestQueryClients() {
  queryClients.forEach((queryClient) => queryClient.clear())
  queryClients.length = 0
}
