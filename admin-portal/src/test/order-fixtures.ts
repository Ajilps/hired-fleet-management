import type { CreateOrderInput, OrderStatus } from '../features/orders/types/order-types'

export const TEST_ORDER_ID = '11111111-1111-4111-8111-111111111111'
export const TEST_COMPANY_ID = '33333333-3333-4333-8333-333333333333'
export const TEST_TRIP_ID = '44444444-4444-4444-8444-444444444444'

export function createOrderResponse(status: OrderStatus = 'received', overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_ORDER_ID, companyId: TEST_COMPANY_ID, source: 'admin_phone', status,
    pickup: { address: 'Indiranagar, Bengaluru' }, drop: { address: 'Kempegowda Airport' }, requestedPickupAt: '2026-10-16T10:30:00+05:30',
    contact: { name: 'Synthetic Contact', phone: '+919800000000' }, vehicleNotes: 'Sedan; 2 passengers', serviceNotes: null,
    estimate: { durationMinutes: null, source: null, calculatedAt: null, updatedAt: null },
    tripId: status === 'accepted' ? TEST_TRIP_ID : null, rejectionReason: status === 'rejected' ? 'No service capacity' : null,
    createdAt: '2026-10-16T03:00:00Z', updatedAt: '2026-10-16T03:00:00Z', ...overrides,
  }
}
export function createTripResponse(overrides: Record<string, unknown> = {}) {
  return { id: TEST_TRIP_ID, orderId: TEST_ORDER_ID, companyId: TEST_COMPANY_ID, status: 'unassigned', totalAmount: '10000.00', currency: 'INR', pickup: { address: 'Indiranagar, Bengaluru' }, drop: { address: 'Kempegowda Airport' }, scheduledPickupAt: '2026-10-16T10:30:00+05:30', ...overrides }
}
export function createCompanyResponse() { return { id: TEST_COMPANY_ID, displayName: 'Acme Mobility', isActive: true } }
export function createOrderInput(): CreateOrderInput {
  return { companyId: TEST_COMPANY_ID, source: 'admin_phone', pickup: { address: 'Indiranagar, Bengaluru' }, drop: { address: 'Kempegowda Airport' }, requestedPickupAt: '2026-10-16T10:30:00+05:30', contact: { name: 'Synthetic Contact', phone: '+919800000000' }, vehicleNotes: 'Sedan; 2 passengers', serviceNotes: null }
}
export function orderListResponse(items = [createOrderResponse()], totalCount = items.length, nextCursor: string | null = null) {
  return { items, pageInfo: { totalCount, hasMore: nextCursor !== null, nextCursor } }
}
