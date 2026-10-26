export const driverStatuses = ['active', 'pending', 'inactive', 'suspended'] as const
export type DriverStatus = typeof driverStatuses[number]

export type Driver = {
  id: string
  user: { id: string; fullName: string; email: string; phone: string | null; isActive: boolean }
  status: DriverStatus
  dateOfBirth: string | null
  homeAddress: string | null
  isOnline: boolean
  onboardedAt: string | null
  activatedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export type DriverFilters = { status: DriverStatus; online: '' | 'true' | 'false'; cursor: string }

export type CreateDriverInput = { fullName: string; email: string; phone: string; initialPassword: string; dateOfBirth?: string; homeAddress?: string }
export type DriverDraft = { fullName: string; email: string; phone: string; initialPassword: string; dateOfBirth: string; homeAddress: string }
