import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { isUuid } from '../../../shared/api/response-validation'
import { getDriver, listDrivers } from '../api/driver-service'
import type { DriverFilters } from '../types/driver-types'

const queryOptions = { retry: false, networkMode: 'always' as const, refetchOnWindowFocus: false, refetchOnReconnect: false }
export function useDrivers(filters: DriverFilters) {
  const session = useAuthStore((state) => state.session)
  return useQuery({ ...queryOptions, queryKey: ['drivers', session?.user.email, filters], enabled: Boolean(session), queryFn: ({ signal }) => listDrivers(filters, session!.accessToken, signal) })
}
export function useDriver(id: string) {
  const session = useAuthStore((state) => state.session)
  return useQuery({ ...queryOptions, queryKey: ['driver', session?.user.email, id], enabled: Boolean(session) && isUuid(id), queryFn: ({ signal }) => getDriver(id, session!.accessToken, signal) })
}
