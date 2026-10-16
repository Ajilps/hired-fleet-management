export function createOverviewList(status: string, totalCount = 0) {
  const limit = status === 'received' ? 3 : 1
  const items = Array.from({ length: Math.min(totalCount, limit) }, (_, index) => ({
    id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
    companyId: '33333333-3333-4333-8333-333333333333',
    status,
    pickup: { address: 'Indiranagar' },
    drop: { address: 'Airport' },
    requestedPickupAt: '2026-10-15T20:00:00Z',
    scheduledPickupAt: '2026-10-15T20:00:00Z',
    periodStart: '2026-09-01',
  }))
  return { items, pageInfo: { totalCount, hasMore: totalCount > items.length, nextCursor: totalCount > items.length ? 'synthetic-cursor' : null } }
}
