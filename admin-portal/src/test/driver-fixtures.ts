export const TEST_DRIVER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const SECOND_DRIVER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

export function driverResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_DRIVER_ID,
    user: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'driver@example.test', role: 'driver', fullName: 'Test Driver', phone: '+919000000001', isActive: true, companyId: null, driverId: TEST_DRIVER_ID, createdAt: '2026-10-15T20:00:00Z' },
    status: 'active', dateOfBirth: '1995-02-28', homeAddress: 'Synthetic address, Bengaluru', isOnline: false,
    onboardedAt: '2026-10-16T08:00:00Z', activatedByUserId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', createdAt: '2026-10-15T20:00:00Z', updatedAt: '2026-10-16T08:00:00Z',
    ...overrides,
  }
}
export function pendingDriverResponse() {
  return driverResponse({ id: SECOND_DRIVER_ID, status: 'pending', dateOfBirth: null, homeAddress: null, onboardedAt: null, activatedByUserId: null,
    user: { ...driverResponse().user, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', driverId: SECOND_DRIVER_ID, fullName: 'Pending Applicant', email: 'pending@example.test', phone: null },
  })
}
export function driverList(items = [driverResponse()], totalCount = items.length, nextCursor: string | null = null) {
  return { items, pageInfo: { totalCount, hasMore: nextCursor !== null, nextCursor } }
}
