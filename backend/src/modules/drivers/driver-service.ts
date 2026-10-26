import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import { authenticateTransaction, provisionDriverAccount } from '../auth/index.ts'
import type { AuthConfig } from '../auth/index.ts'
import { createCommandExecutor } from '../commands/index.ts'
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import { createDriverRepository } from './driver-repository.ts'
import { createDriverCursor } from './driver-cursor.ts'
import { driverDto } from './driver-mapper.ts'
import type { CreateDriverInput, ListDriversInput, ActivateDriverInput } from './driver-validator.ts'

type Identity = { accessToken: string; key: string; requestId: string; origin?: string; csrfGuard?: string }
export function createDriverService(client: PrismaClient, auth: AuthConfig, fingerprintKey: Uint8Array, origins: string[] = []) {
 const execute = createCommandExecutor(client, { auth, fingerprintKey }); const cursor = createDriverCursor(fingerprintKey)
 async function read<T>(token: string, own: boolean, run: (repository: ReturnType<typeof createDriverRepository>, actor: Awaited<ReturnType<typeof authenticateTransaction>>) => Promise<T>) {
  return client.$transaction((transaction) => withWorkflowTransaction(transaction, async (context) => {
   const actor = await authenticateTransaction(context, token, auth, own ? ['driver'] : ['admin'])
   return run(createDriverRepository(context), actor)
  }), { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 })
 }
 return {
  activate(identity: Identity, id: string, input: ActivateDriverInput) {
   return execute({ ...identity, method: 'PATCH', canonicalPath: `/api/v1/drivers/${id}/status`, request: input,
    async authorize(context, actor) {
     if (actor.transport === 'browser' && (!origins.includes(identity.origin ?? '') || identity.csrfGuard !== '1')) throw new HttpError(403, 'FORBIDDEN', 'Browser origin or CSRF protection is invalid.')
     await createDriverRepository(context).find(id)
    },
    async execute(context, actor) {
     // Hold account enablement and profile state through eligibility, audit and replay commit.
     await context.$queryRaw`SELECT u.id FROM users u JOIN drivers d ON d.user_id = u.id WHERE d.id = ${id}::uuid FOR SHARE OF u`
     await context.$queryRaw`SELECT id FROM drivers WHERE id = ${id}::uuid FOR UPDATE`
     const before = await createDriverRepository(context).find(id)
     if (!before.user.isActive || before.status !== 'Pending') throw new HttpError(409, 'DRIVER_NOT_ELIGIBLE', 'An enabled pending driver account is required for initial activation.')
     const documents = await context.$queryRaw<{ documentType: string }[]>`
      SELECT d.document_type::text AS "documentType" FROM driver_documents d JOIN file_assets f ON f.id = d.file_asset_id
      WHERE d.driver_id = ${id}::uuid AND d.is_current AND f.driver_id = ${id}::uuid
      AND f.uploaded_by_user_id = ${before.user.id}::uuid AND f.malware_scan_status = 'clean' AND f.purpose = 'driver_document'
      FOR SHARE OF d, f`
     if (!['driving_license', 'aadhar', 'pan', 'pcc'].every(type => documents.some(document => document.documentType === type))) throw new HttpError(409, 'DRIVER_DOCUMENTS_REQUIRED', 'All four current clean documents are required for activation.')
     const now = new Date()
     await context.driver.update({ where: { id }, data: { status: 'Active', onboardedAt: before.onboardedAt ?? now, activatedByUserId: before.activatedByUserId ?? actor.userId, updatedAt: now } })
     const body = driverDto(await createDriverRepository(context).find(id))
     return { outcome: 'succeeded', response: { status: 200, body }, audit: [{ entityType: 'driver', entityId: id, action: 'driver.activated', before: { status: 'pending' }, after: { id, status: 'active', onboardedAt: body.onboardedAt, activatedByUserId: body.activatedByUserId, reason: input.reason } }] }
    },
   })
  },
  get(token: string, id: string) { return read(token, false, async (repository) => driverDto(await repository.find(id))) },
  own(token: string) { return read(token, true, async (repository, actor) => driverDto(await repository.find(actor.driverId!))) },
  list(token: string, input: ListDriversInput) {
   return read(token, false, async (repository, actor) => {
    const scope = `drivers:${actor.userId}:${input.status ?? 'all'}:${input.isOnline ?? 'all'}:created-desc`
    const result = await repository.list(input, cursor.decode(scope, input.cursor)); const hasMore = result.items.length > input.limit; const items = result.items.slice(0, input.limit)
    return { items: items.map(({ driver }) => driverDto(driver)), pageInfo: { totalCount: result.totalCount, hasMore, nextCursor: hasMore ? cursor.encode(scope, items.at(-1)!.position) : null } }
   })
  },
  async create(identity: Identity, input: CreateDriverInput) {
   try {
    return await execute({ ...identity, method: 'POST', canonicalPath: '/api/v1/drivers', request: input, authorize: async () => {},
     async execute(context) {
      const now = new Date(); const user = await provisionDriverAccount(context, input, now)
      const id = randomUUID()
      await context.driver.create({ data: { id, userId: user.id, dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00Z`) : null, homeAddress: input.homeAddress ?? null, createdAt: now, updatedAt: now } })
      const body = driverDto(await createDriverRepository(context).find(id))
      return { outcome: 'succeeded', response: { status: 201, body, headers: { Location: `/api/v1/drivers/${id}` } }, audit: [{ entityType: 'driver', entityId: id, action: 'driver.provisioned', after: { id, userId: user.id, status: 'pending', passwordChangeRequired: true } }] }
     },
    })
   } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new HttpError(409, 'ACCOUNT_CONFLICT', 'The account could not be created. Review the email and account details.')
    throw error
   }
  },
 }
}
export type DriverService = ReturnType<typeof createDriverService>
