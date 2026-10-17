import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { isUuid } from '../../../shared/api/response-validation'
import { listDriverAvailability } from '../api/driver-availability-service'
import { rangeDayCount } from '../validation/driver-calendar'

export function useDriverAvailability(driverId: string, from: string, to: string, enabled: boolean) {
  const session = useAuthStore((state) => state.session)
  return useQuery({ queryKey: ['driver-availability', session?.user.email, driverId, from, to], enabled: Boolean(session) && enabled && isUuid(driverId) && rangeDayCount(from, to) !== null,
    retry: false, networkMode: 'always', refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: ({ signal }) => listDriverAvailability(driverId, from, to, session!.accessToken, signal),
  })
}
