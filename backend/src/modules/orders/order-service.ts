import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import { authenticateTransaction } from '../auth/index.ts'
import type { AuthConfig } from '../auth/index.ts'
import { createCommandExecutor, aggregateEtag, requireAggregateMatch, nextAggregateVersion } from '../commands/index.ts'
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { createCompanyCursor } from '../companies/company-cursor.ts'
import { createCompanyRepository } from '../companies/company-repository.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import { createOrderRepository } from './order-repository.ts'
import { orderDto, tripDto } from './order-mapper.ts'
import type { CreateOrderInput, OrderListInput } from './order-validator.ts'
import type { OrderCodeCipher } from './order-code.ts'
type Identity = { accessToken: string; key: string; requestId: string; ifMatch?: string }
export function createOrderService(client: PrismaClient, auth: AuthConfig, fingerprintKey: Uint8Array, cipher?: OrderCodeCipher) {
 const execute = createCommandExecutor(client, { auth, fingerprintKey, allowedRoles: ['admin', 'partner'] })
 const decide = createCommandExecutor(client, { auth, fingerprintKey })
 const cursor = createCompanyCursor(fingerprintKey)
 const read = <T>(token: string, run: (tx: import('../../shared/database/workflow-transaction.ts').WorkflowTransaction, actor: Awaited<ReturnType<typeof authenticateTransaction>>) => Promise<T>) => client.$transaction(tx => withWorkflowTransaction(tx, async context => run(context, await authenticateTransaction(context, token, auth, ['admin', 'partner']))), { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 })
 return {
  list(token: string, input: OrderListInput) {
   return read(token, async (tx, actor) => {
    if (actor.role === 'partner' && input.companyId) throw new HttpError(422, 'VALIDATION_FAILED', 'Partners must omit company filters.')
    const companyId = actor.companyId ?? input.companyId
    const scope = JSON.stringify(['orders', actor.userId, companyId, input.status, input.createdFrom, input.createdTo])
    const result = await createOrderRepository(tx).list({ ...(companyId ? { companyId } : {}), ...(input.status ? { status: input.status } : {}), createdAt: { ...(input.createdFrom ? { gte: new Date(input.createdFrom) } : {}), ...(input.createdTo ? { lt: new Date(input.createdTo) } : {}) } }, input.limit, cursor.decode(scope, input.cursor))
    const items = result.items.slice(0, input.limit); const hasMore = result.items.length > input.limit
    return { items: items.map(orderDto), pageInfo: { totalCount: result.totalCount, hasMore, nextCursor: hasMore ? cursor.encode(scope, items.at(-1)!) : null } }
   })
  },
  get(token: string, id: string) { return read(token, async (tx, actor) => { const row = await createOrderRepository(tx).find(id, actor.companyId); return { body: orderDto(row), etag: aggregateEtag('order', id, row.version) } }) },
  create(identity: Identity, input: CreateOrderInput) {
   return execute({ ...identity, method: 'POST', canonicalPath: '/api/v1/orders', request: input,
    authorize: async (tx, actor) => {
     if (actor.role === 'partner' ? input.companyId !== undefined || input.source !== undefined : !input.companyId || !input.source) throw new HttpError(422, 'VALIDATION_FAILED', 'Company and source must match the intake role.')
     if (actor.role === 'partner') {
      const previous = await tx.commandReplay.findFirst({ where: { actorUserId: actor.userId, requestMethod: 'POST', canonicalPath: '/api/v1/orders', idempotencyKey: identity.key } })
      const body = previous?.responseBody as { companyId?: string } | undefined
      if (previous && previous.expiresAt > new Date() && body?.companyId !== actor.companyId) throw new HttpError(404, 'NOT_FOUND', 'Order not found.')
     }
    },
    async execute(tx, actor) {
     const companyId = actor.companyId ?? input.companyId!
     const company = await createCompanyRepository(tx).lock(companyId)
     if (!company.isActive) throw new HttpError(409, 'COMPANY_INACTIVE', 'This company cannot place new orders.')
     const now = await createCompanyRepository(tx).time()
     const row = await tx.order.create({ data: { id: randomUUID(), companyId, createdByUserId: actor.userId, source: actor.role === 'partner' ? 'partner_portal' : input.source!, requestedPickupAt: new Date(input.requestedPickupAt), pickupAddress: input.pickup.address, pickupLat: input.pickup.latitude, pickupLng: input.pickup.longitude, dropAddress: input.drop.address, dropLat: input.drop.latitude, dropLng: input.drop.longitude, contactName: input.contact.name, contactPhone: input.contact.phone, vehicleNotes: input.vehicleNotes ?? null, serviceNotes: input.serviceNotes ?? null, routeDistanceKm: input.routeDistanceKm ?? null, createdAt: now, updatedAt: now }, include: { trip: true } })
     const body = orderDto(row)
     return { outcome: 'succeeded', response: { status: 201, body, headers: { Location: `/api/v1/orders/${row.id}` } }, audit: [{ entityType: 'order', entityId: row.id, action: 'order.created', after: body }] }
    },
   })
  },
  decision(identity: Identity, id: string, action: 'accept' | 'reject', input: { totalAmount: string } | { reason: string }) {
   return decide({ ...identity, method: 'POST', canonicalPath: `/api/v1/orders/${id}/${action}`, request: input,
    authorize: async tx => { await createOrderRepository(tx).find(id) },
    async execute(tx, actor) {
     const repository = createOrderRepository(tx)
     // Company before order, also used by future closure and rate changes.
     const initial = await repository.find(id)
     const company = await createCompanyRepository(tx).lock(initial.companyId)
     const before = await repository.lock(id)
     if (before.status !== 'received') throw new HttpError(409, 'ORDER_ALREADY_DECIDED', 'This order has already been decided. Refresh before continuing.')
     requireAggregateMatch(identity.ifMatch, aggregateEtag('order', id, before.version))
     const now = await createCompanyRepository(tx).time()
     if (action === 'accept') {
      if (!company.isActive) throw new HttpError(409, 'COMPANY_INACTIVE', 'This company cannot accept new trips.')
      if (!cipher) throw new HttpError(503, 'TRIP_CODE_UNAVAILABLE', 'Trip code protection is not configured.')
      const tripId = randomUUID()
      await tx.trip.create({ data: { id: tripId, orderId: id, companyId: before.companyId, totalAmount: (input as { totalAmount: string }).totalAmount, scheduledPickupAt: before.requestedPickupAt, pickupAddress: before.pickupAddress, pickupLat: before.pickupLat, pickupLng: before.pickupLng, dropAddress: before.dropAddress, dropLat: before.dropLat, dropLng: before.dropLng, contactName: before.contactName, contactPhone: before.contactPhone, vehicleNotes: before.vehicleNotes, serviceNotes: before.serviceNotes, routeDistanceKm: before.routeDistanceKm, estimatedDurationMinutes: before.estimatedDurationMinutes, estimatedDurationSource: before.estimatedDurationSource, estimateAverageSpeedKmh: before.estimateAverageSpeedKmh, estimatePolicyVersion: before.estimatePolicyVersion, adminEtaMinutes: before.adminEtaMinutes, etaSource: before.etaSource, etaCalculatedAt: before.etaCalculatedAt, etaUpdatedAt: before.etaUpdatedAt, etaOverriddenByUserId: before.etaOverriddenByUserId, ...cipher.generate(tripId), otpGeneratedAt: now, createdAt: now, updatedAt: now } })
     }
     await tx.order.update({ where: { id }, data: { status: action === 'accept' ? 'accepted' : 'rejected', ...(action === 'accept' ? { acceptedByUserId: actor.userId, acceptedAt: now } : { rejectedByUserId: actor.userId, rejectedAt: now, rejectionReason: (input as { reason: string }).reason }), version: nextAggregateVersion(before.version), updatedAt: now } })
     const after = await repository.find(id); const body = orderDto(after)
     const email = z.email().max(255).safeParse(company.contactEmail)
     const event = action === 'accept' ? 'order_accepted' : 'order_rejected'
     await tx.notification.create({ data: { id: randomUUID(), userId: actor.userId, companyId: company.id, orderId: id, eventType: event, recipientEmail: email.success ? email.data : null, status: email.success ? 'pending' : 'failed', failureReason: email.success ? null : 'RECIPIENT_MISSING', templateKey: event, deduplicationKey: `${event}:${id}:company-contact:email`, payload: { orderId: id, ...(after.trip ? { tripId: after.trip.id } : {}), ...(action === 'reject' ? { reason: after.rejectionReason } : {}) }, nextAttemptAt: now, createdAt: now, updatedAt: now } })
     return { outcome: 'succeeded', response: { status: 200, body: action === 'accept' ? { order: body, trip: tripDto(after.trip!) } : body, headers: { ETag: aggregateEtag('order', id, after.version) } }, audit: [{ entityType: 'order', entityId: id, action: `order.${after.status}`, before: orderDto(before), after: body }] }
    },
   })
  },
 }
}
