import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { isUuid } from '../../../shared/api/response-validation'
import { getOrder, listOrders } from '../api/order-service'
import { getCompanyOption, listCompanyOptions } from '../api/company-options-service'
import { validateFilters } from '../validation/order-validation'
import type { OrderFilters } from '../types/order-types'

export function useOrders(filters: OrderFilters) {
  const session = useAuthStore((state) => state.session)
  const { status, companyId, from, to, cursor } = filters
  return useQuery({
    queryKey: ['orders', session?.user.email, { status, companyId, from, to, cursor }],
    enabled: Boolean(session) && !validateFilters(filters), networkMode: 'always', retry: false,
    queryFn: ({ signal }) => listOrders(filters, session!.accessToken, signal),
  })
}
export function useOrder(id: string) {
  const session = useAuthStore((state) => state.session)
  return useQuery({ queryKey: ['order', session?.user.email, id], enabled: Boolean(session) && isUuid(id), networkMode: 'always', retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, queryFn: ({ signal }) => getOrder(id, session!.accessToken, signal) })
}
export function useCompanyOptions() {
  const session = useAuthStore((state) => state.session)
  return useInfiniteQuery({
    queryKey: ['company-options', session?.user.email], enabled: Boolean(session), initialPageParam: '', retry: false, networkMode: 'always',
    queryFn: ({ pageParam, signal }) => listCompanyOptions(pageParam, session!.accessToken, signal),
    getNextPageParam: (page, pages) => page.pageInfo.hasMore && !pages.some((previous) => previous !== page && previous.pageInfo.nextCursor === page.pageInfo.nextCursor) ? page.pageInfo.nextCursor ?? undefined : undefined,
  })
}
export function useCompanyOption(id: string) {
  const session = useAuthStore((state) => state.session)
  return useQuery({ queryKey: ['company-option', session?.user.email, id], enabled: Boolean(session) && isUuid(id), networkMode: 'always', retry: false, queryFn: ({ signal }) => getCompanyOption(id, session!.accessToken, signal) })
}
