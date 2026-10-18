import type { Prisma } from '../../generated/prisma/client.ts'

// Deliberate safe projection; driver directory/profile queries never load credentials.
export const driverSelect = { id: true, userId: true, status: true, dateOfBirth: true, homeAddress: true, onlineStatus: true, onboardedAt: true, activatedByUserId: true, createdAt: true, updatedAt: true, user: { select: { id: true, email: true, fullName: true, phone: true, isActive: true, passwordChangeRequired: true, createdAt: true } } } as const
export type DriverRecord = Prisma.DriverGetPayload<{ select: typeof driverSelect }>
export function driverDto(driver: DriverRecord) {
 const user = driver.user
 return { id: driver.id, user: { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone, role: 'driver' as const, isActive: user.isActive, passwordChangeRequired: user.passwordChangeRequired, companyId: null, driverId: driver.id, createdAt: user.createdAt.toISOString() }, status: driver.status === 'Pending' ? 'pending' : driver.status === 'Active' ? 'active' : driver.status === 'Inactive' ? 'inactive' : 'suspended', dateOfBirth: driver.dateOfBirth?.toISOString().slice(0, 10) ?? null, homeAddress: driver.homeAddress, isOnline: driver.onlineStatus, onboardedAt: driver.onboardedAt?.toISOString() ?? null, activatedByUserId: driver.activatedByUserId, createdAt: driver.createdAt.toISOString(), updatedAt: driver.updatedAt.toISOString() }
}
