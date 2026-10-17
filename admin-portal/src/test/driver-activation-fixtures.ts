import { pendingDriverResponse } from './driver-fixtures'
import type { Driver } from '../features/drivers/types/driver-types'

export const ACTIVATION_DRIVER_ID = pendingDriverResponse().id
export function activationDriver(): Driver {
  const pending = pendingDriverResponse()
  return { ...pending, status: 'pending', dateOfBirth: null, homeAddress: null, onboardedAt: null, activatedByUserId: null }
}
export function activatedDriverResponse(overrides: Record<string, unknown> = {}) {
  return { ...pendingDriverResponse(), status: 'active', onboardedAt: '2026-10-17T08:00:00Z', activatedByUserId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', updatedAt: '2026-10-17T08:00:00Z', ...overrides }
}
