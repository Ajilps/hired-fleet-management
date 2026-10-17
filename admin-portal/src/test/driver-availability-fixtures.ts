export function availabilityDateResponse(overrides: Record<string, unknown> = {}) {
  return { availabilityDate: '2026-10-17', isAvailable: true, note: 'Synthetic availability note', updatedAt: '2026-10-16T20:00:00Z', ...overrides }
}
export function availabilityList(items = [availabilityDateResponse()], totalCount = items.length, nextCursor: string | null = null) {
  return { items, pageInfo: { totalCount, hasMore: nextCursor !== null, nextCursor } }
}
