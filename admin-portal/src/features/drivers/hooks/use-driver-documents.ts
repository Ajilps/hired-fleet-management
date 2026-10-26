import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { listDriverDocuments } from '../api/driver-document-service'

export function useDriverDocuments(driverId: string, enabled: boolean) {
  const session = useAuthStore((state) => state.session)
  return useQuery({ queryKey: ['driver-documents', session?.user.email, driverId], enabled: Boolean(session) && enabled, retry: false, networkMode: 'always', refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: ({ signal }) => listDriverDocuments(driverId, session!.accessToken, signal),
  })
}
