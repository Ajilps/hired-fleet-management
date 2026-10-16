export const orderStatuses = ['received', 'accepted', 'rejected'] as const
export const orderSources = ['partner_portal', 'admin_phone', 'admin_whatsapp', 'admin_manual'] as const
export type OrderStatus = typeof orderStatuses[number]
export type OrderSource = typeof orderSources[number]
export const sourceLabels: Record<OrderSource, string> = { partner_portal: 'Partner portal', admin_phone: 'Phone', admin_whatsapp: 'WhatsApp', admin_manual: 'Manual entry' }
export type Order = {
  id: string; companyId: string; source: OrderSource; status: OrderStatus
  pickup: string; drop: string; requestedPickupAt: string
  contact: { name: string; phone: string }; vehicleNotes: string | null; serviceNotes: string | null
  estimate: { durationMinutes: number | null; source: 'maps' | 'distance_heuristic' | 'admin_override' | null }
  tripId: string | null; rejectionReason: string | null; createdAt: string
}
export type OrderDetail = { order: Order; etag: string | null }
export type OrderFilters = { status: string; companyId: string; from: string; to: string; cursor: string; search: string; source: string }
export type CreateOrderInput = {
  companyId: string; source: Exclude<OrderSource, 'partner_portal'>
  pickup: { address: string }; drop: { address: string }; requestedPickupAt: string
  contact: { name: string; phone: string }; vehicleNotes: string | null; serviceNotes: string | null
}
