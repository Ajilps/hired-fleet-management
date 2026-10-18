import type { User } from '../../generated/prisma/client.ts'
import { HttpError } from '../../shared/http/http-error.ts'

export type ScopedUser = User & { companyMemberships: { companyId: string }[]; driver?: { id: string } | null }
export const userScope = { companyMemberships: { select: { companyId: true } }, driver: { select: { id: true } } } as const
export function userDto(user: ScopedUser) {
  const companyId = user.role === 'Partner' && user.companyMemberships.length === 1 ? user.companyMemberships[0]!.companyId : null
  const driverId = user.role === 'Driver' ? user.driver?.id ?? null : null
  if (user.role !== 'Admin' && !(user.role === 'Partner' && companyId) && !(user.role === 'Driver' && driverId)) throw new HttpError(403, 'FORBIDDEN', 'The account has no supported access scope.')
  return { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone, role: user.role === 'Admin' ? 'admin' as const : user.role === 'Partner' ? 'partner' as const : 'driver' as const, isActive: user.isActive, passwordChangeRequired: user.passwordChangeRequired, companyId, driverId, createdAt: user.createdAt.toISOString() }
}
