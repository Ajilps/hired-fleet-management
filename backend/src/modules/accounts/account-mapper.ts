import type { Prisma } from '../../generated/prisma/client.ts'

// Management reads can describe orphaned/future-role accounts without granting auth scope.
// No credential column is loaded by these directory queries.
export const accountSelect = { id: true, email: true, fullName: true, phone: true, role: true, isActive: true, passwordChangeRequired: true, createdAt: true, companyMemberships: { select: { companyId: true } } } as const
export type AccountRecord = Prisma.UserGetPayload<{ select: typeof accountSelect }>
export function accountDto(user: AccountRecord) {
  return { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone, role: user.role === 'Admin' ? 'admin' as const : user.role === 'Partner' ? 'partner' as const : 'driver' as const, isActive: user.isActive, passwordChangeRequired: user.passwordChangeRequired, companyId: user.role === 'Partner' ? user.companyMemberships[0]?.companyId ?? null : null, driverId: null, createdAt: user.createdAt.toISOString() }
}
