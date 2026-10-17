import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { isUuid } from '../../../shared/api/response-validation'
import { getCompany, listCompanies, listCompanyRates } from '../api/company-service'

const queryOptions = { retry: false, networkMode: 'always' as const, refetchOnWindowFocus: false, refetchOnReconnect: false }
export function useCompanies(cursor: string) {
  const session = useAuthStore((state) => state.session)
  return useQuery({ ...queryOptions, queryKey: ['companies', session?.user.email, cursor], enabled: Boolean(session), queryFn: ({ signal }) => listCompanies(cursor, session!.accessToken, signal) })
}
export function useCompany(id: string) {
  const session = useAuthStore((state) => state.session)
  return useQuery({ ...queryOptions, queryKey: ['company', session?.user.email, id], enabled: Boolean(session) && isUuid(id), queryFn: ({ signal }) => getCompany(id, session!.accessToken, signal) })
}
export function useCompanyRates(id: string, isEnabled: boolean) {
  const session = useAuthStore((state) => state.session)
  return useInfiniteQuery({ ...queryOptions, queryKey: ['company-rates', session?.user.email, id], enabled: Boolean(session) && isUuid(id) && isEnabled, initialPageParam: '',
    queryFn: ({ pageParam, signal }) => listCompanyRates(id, pageParam, session!.accessToken, signal),
    getNextPageParam: (page, pages) => page.pageInfo.hasMore && !pages.some((previous) => previous !== page && previous.pageInfo.nextCursor === page.pageInfo.nextCursor) ? page.pageInfo.nextCursor ?? undefined : undefined,
  })
}
