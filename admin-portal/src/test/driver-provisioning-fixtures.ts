import { driverResponse } from './driver-fixtures'
import type { CreateDriverInput } from '../features/drivers/types/driver-types'
export const TEST_DRIVER_PASSWORD = 'synthetic-driver-initial-password'
export function driverInput(): CreateDriverInput { return { fullName: 'Synthetic Invited Driver', email: 'invited@example.test', phone: '+919000000002', initialPassword: TEST_DRIVER_PASSWORD } }
export function provisionedDriverResponse(input = driverInput()) { const base = driverResponse(); return { ...base, user: { ...base.user, fullName: input.fullName, email: input.email, phone: input.phone, passwordChangeRequired: true }, status: 'pending', isOnline: false, dateOfBirth: input.dateOfBirth ?? null, homeAddress: input.homeAddress ?? null, onboardedAt: null, activatedByUserId: null } }
