import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { isUuid } from '../../../shared/api/response-validation'
import { listCompanyPartners } from '../api/partner-service'

export function useCompanyPartners(companyId: string, cursor: string) {
  const session = useAuthStore((state) => state.session)
  return useQuery({ queryKey: ['company-partners', session?.user.email, companyId, cursor], enabled: Boolean(session) && isUuid(companyId), retry: false, networkMode: 'always', refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: ({ signal }) => listCompanyPartners(companyId, cursor, session!.accessToken, signal),
  })
}
