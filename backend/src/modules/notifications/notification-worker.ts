import { randomUUID } from 'node:crypto'
import type { PrismaClient, Notification } from '../../generated/prisma/client.ts'
export type NotificationTransport = { send: (notification: Notification) => Promise<string> }
export function createNotificationWorker(client: PrismaClient, transport: NotificationTransport) {
 async function claim() {
  return client.$transaction(async tx => {
   const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM notifications WHERE
    (status = 'pending' AND next_attempt_at <= clock_timestamp()) OR
    (status = 'processing' AND lease_expires_at <= clock_timestamp())
    ORDER BY next_attempt_at, id FOR UPDATE SKIP LOCKED LIMIT 1`
   const id = rows[0]?.id; if (!id) return null
   const row = await tx.notification.findUniqueOrThrow({ where: { id } })
   const now = (await tx.$queryRaw<{ now: Date }[]>`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`)[0]!.now
   if (row.attemptCount - row.attemptCycleStart >= 5) {
    await tx.notification.update({ where: { id }, data: { status: 'failed', failureReason: 'ATTEMPT_LIMIT_REACHED', leaseToken: null, leaseExpiresAt: null, updatedAt: now } }); return null
   }
   return tx.notification.update({ where: { id }, data: { status: 'processing', attemptCount: { increment: 1 }, lastAttemptAt: now, leaseToken: randomUUID(), leaseExpiresAt: new Date(now.getTime() + 60_000), updatedAt: now } })
  })
 }
 async function acknowledge(row: Notification, messageId: string | null) {
  return client.$transaction(async tx => {
   // Lock and choose DB time after the lock: acknowledgement cannot outlive a lease.
   await tx.$queryRaw`SELECT id FROM notifications WHERE id = ${row.id}::uuid FOR UPDATE`
   const now = (await tx.$queryRaw<{ now: Date }[]>`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`)[0]!.now
   const cycleAttempts = row.attemptCount - row.attemptCycleStart
   return tx.notification.updateMany({ where: { id: row.id, status: 'processing', leaseToken: row.leaseToken, leaseExpiresAt: { gt: now } }, data: messageId ? { status: 'sent', providerMessageId: messageId.slice(0,255), sentAt: now, failureReason: null, leaseToken: null, leaseExpiresAt: null, updatedAt: now } : { status: cycleAttempts >= 5 ? 'failed' : 'pending', failureReason: 'DELIVERY_FAILED', nextAttemptAt: new Date(now.getTime() + ([60, 300, 900, 3600][cycleAttempts - 1] ?? 3600) * 1000), leaseToken: null, leaseExpiresAt: null, updatedAt: now } })
  })
 }
 return {
  claim,
  acknowledge,
  async runOnce() {
   const row = await claim(); if (!row) return false
   let messageId: string | null = null
   try { messageId = await transport.send(row) } catch { /* Persist only a bounded server-owned failure label. */ }
   await acknowledge(row, messageId)
   return true
  },
 }
}
