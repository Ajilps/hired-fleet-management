import type { User } from '../../generated/prisma/client.ts'
import { HttpError } from '../../shared/http/http-error.ts'

export type ScopedUser = User & { companyMemberships: { companyId: string }[] }
export const userScope = { companyMemberships: { select: { companyId: true } } } as const
export function userDto(user: ScopedUser) {
  const companyId = user.role === 'Partner' && user.companyMemberships.length === 1 ? user.companyMemberships[0]!.companyId : null
  if (user.role !== 'Admin' && !(user.role === 'Partner' && companyId)) throw new HttpError(403, 'FORBIDDEN', 'The account has no supported access scope.')
  return { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone, role: user.role === 'Admin' ? 'admin' as const : 'partner' as const, isActive: user.isActive, passwordChangeRequired: user.passwordChangeRequired, companyId, driverId: null, createdAt: user.createdAt.toISOString() }
}
