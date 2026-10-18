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
import type { CreateDriverInput, ListDriversInput } from './driver-validator.ts'

type Identity = { accessToken: string; key: string; requestId: string }
export function createDriverService(client: PrismaClient, auth: AuthConfig, fingerprintKey: Uint8Array) {
 const execute = createCommandExecutor(client, { auth, fingerprintKey }); const cursor = createDriverCursor(fingerprintKey)
 async function read<T>(token: string, own: boolean, run: (repository: ReturnType<typeof createDriverRepository>, actor: Awaited<ReturnType<typeof authenticateTransaction>>) => Promise<T>) {
  return client.$transaction((transaction) => withWorkflowTransaction(transaction, async (context) => {
   const actor = await authenticateTransaction(context, token, auth, own ? ['driver'] : ['admin'])
   return run(createDriverRepository(context), actor)
  }), { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 })
 }
 return {
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
