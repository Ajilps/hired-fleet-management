import type { PrismaClient } from '../../generated/prisma/client.ts'
import { authenticateTransaction, provisionAdminAccount } from '../auth/index.ts'
import type { AuthConfig } from '../auth/index.ts'
import { createCommandExecutor } from '../commands/index.ts'
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import { createAccountRepository } from './account-repository.ts'
import { accountDto } from './account-mapper.ts'
import { createAccountCursor } from './account-cursor.ts'
import type { ListAccountsInput, CreateAdminInput, AccountStatusInput } from './account-validator.ts'

type Identity = { accessToken: string; key: string; requestId: string }
export function createAccountService(client: PrismaClient, auth: AuthConfig, fingerprintKey: Uint8Array) {
  const execute = createCommandExecutor(client, { auth, fingerprintKey })
  const cursor = createAccountCursor(fingerprintKey)
  function read<T>(token: string, run: (transaction: WorkflowTransaction, actorId: string) => Promise<T>) {
    return client.$transaction((transaction) => withWorkflowTransaction(transaction, async (context) => {
      const actor = await authenticateTransaction(context, token, auth)
      return run(context, actor.userId)
    }), { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 })
  }
  return {
    list(token: string, input: ListAccountsInput) {
      return read(token, async (context, actorId) => {
        const scope = `users:${actorId}:${input.role ?? 'all'}:created-desc`
        const result = await createAccountRepository(context).list(input, cursor.decode(scope, input.cursor))
        const hasMore = result.items.length > input.limit; const items = result.items.slice(0, input.limit)
        return { items: items.map(({ user }) => accountDto(user)), pageInfo: { totalCount: result.totalCount, hasMore, nextCursor: hasMore ? cursor.encode(scope, items.at(-1)!.position) : null } }
      })
    },
    get(token: string, id: string) { return read(token, async (context) => accountDto(await createAccountRepository(context).find(id))) },
    async create(identity: Identity, input: CreateAdminInput) {
      try {
        return await execute({ ...identity, method: 'POST', canonicalPath: '/api/v1/users', request: input,
          authorize: async () => {},
          async execute(context) {
            const created = await provisionAdminAccount(context, input, new Date())
            const body = accountDto(await createAccountRepository(context).find(created.id))
            return { outcome: 'succeeded', response: { status: 201, body, headers: { Location: `/api/v1/users/${created.id}` } }, audit: [{ entityType: 'user', entityId: created.id, action: 'admin.provisioned', after: body }] }
          },
        })
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new HttpError(409, 'ACCOUNT_CONFLICT', 'The account could not be created. Review the email and account details.')
        throw error
      }
    },
    setStatus(identity: Identity, id: string, input: AccountStatusInput) {
      return execute({ ...identity, serializeAccountStatus: true, method: 'PATCH', canonicalPath: `/api/v1/users/${id}/status`, request: input,
        authorize: async (context) => { await createAccountRepository(context).find(id) },
        async execute(context) {
          const repository = createAccountRepository(context)
          const before = await repository.lock(id)
          if (!input.isActive && before.role === 'Admin' && before.isActive && !before.passwordChangeRequired && await repository.countUsableAdmins() <= 1) {
            throw new HttpError(409, 'LAST_ACTIVE_ADMIN', 'The last admin with completed password setup cannot be disabled.')
          }
          const now = new Date()
          const after = await repository.setStatus(id, input.isActive, now)
          // Disabling again with a new intent still ensures no live session survives.
          if (!input.isActive) await repository.revokeSessions(id, now)
          const body = accountDto(after)
          return { outcome: 'succeeded', response: { status: 200, body }, audit: [{ entityType: 'user', entityId: id, action: input.isActive ? 'account.enabled' : 'account.disabled', before: accountDto(before), after: { ...body, reason: input.reason } }] }
        },
      })
    },
  }
}
export type AccountService = ReturnType<typeof createAccountService>
