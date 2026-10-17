import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import { authenticateTransaction, createPartnerAccount } from '../auth/index.ts'
import type { AuthConfig } from '../auth/index.ts'
import { createCommandExecutor } from '../commands/index.ts'
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import { createCompanyRepository } from './company-repository.ts'
import { createCompanyCursor } from './company-cursor.ts'
import { companyDto, rateDto, partnerDto } from './company-mapper.ts'
import type { CreateCompanyInput, PatchCompanyInput, CreateRateInput, ListInput, CreatePartnerInput } from './company-validator.ts'

type Identity = { accessToken: string; key: string; requestId: string }
export function createCompanyService(client: PrismaClient, auth: AuthConfig, fingerprintKey: Uint8Array) {
  const execute = createCommandExecutor(client, { auth, fingerprintKey })
  const cursor = createCompanyCursor(fingerprintKey)
  async function read<T>(accessToken: string, run: (transaction: WorkflowTransaction, actorId: string, companyId: string | null) => Promise<T>, allowPartner = false) {
    return client.$transaction((transaction) => withWorkflowTransaction(transaction, async (context) => {
      const actor = await authenticateTransaction(context, accessToken, auth, allowPartner)
      return run(context, actor.userId, actor.companyId)
    }), { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 })
  }
  function page<T extends { id: string; createdAt: Date }, R>(scope: string, result: { items: T[]; totalCount: number }, limit: number, map: (item: T) => R) {
    const hasMore = result.items.length > limit
    const items = result.items.slice(0, limit)
    return { items: items.map(map), pageInfo: { totalCount: result.totalCount, hasMore, nextCursor: hasMore ? cursor.encode(scope, items.at(-1)!) : null } }
  }
  return {
    list(accessToken: string, input: ListInput) {
      return read(accessToken, async (transaction, actorId) => {
        const scope = `companies:${actorId}:created-desc`
        return page(scope, await createCompanyRepository(transaction).list(input.limit, cursor.decode(scope, input.cursor)), input.limit, companyDto)
      })
    },
    get(accessToken: string, id: string) { return read(accessToken, async (transaction, _actorId, companyId) => {
      if (companyId && companyId !== id) throw new HttpError(404, 'NOT_FOUND', 'Company not found.')
      return companyDto(await createCompanyRepository(transaction).find(id))
    }, true) },
    rates(accessToken: string, id: string, input: ListInput) {
      return read(accessToken, async (transaction, actorId) => {
        const repository = createCompanyRepository(transaction)
        await repository.find(id)
        const scope = `rates:${actorId}:${id}:created-desc`
        return page(scope, await repository.rates(id, input.limit, cursor.decode(scope, input.cursor)), input.limit, rateDto)
      })
    },
    partners(accessToken: string, id: string, input: ListInput) {
      return read(accessToken, async (transaction, actorId) => {
        const repository = createCompanyRepository(transaction)
        await repository.find(id)
        const scope = `partners:${actorId}:${id}:created-desc`
        return page(scope, await repository.partners(id, input.limit, cursor.decode(scope, input.cursor)), input.limit, partnerDto)
      })
    },
    async createPartner(identity: Identity, id: string, input: CreatePartnerInput) {
      try {
        return await execute({ ...identity, method: 'POST', canonicalPath: `/api/v1/companies/${id}/partners`, request: input,
          authorize: async (transaction) => { await createCompanyRepository(transaction).find(id) },
          async execute(transaction) {
            const repository = createCompanyRepository(transaction)
            await repository.lock(id)
            const now = await repository.time()
            const user = await createPartnerAccount(transaction, input, now)
            const membership = await repository.addPartner(id, user.id, input.isPrimaryContact, now)
            const body = partnerDto(membership)
            return { outcome: 'succeeded', response: { status: 201, body }, audit: [{ entityType: 'user', entityId: user.id, action: 'partner.provisioned', after: body }] }
          },
        })
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new HttpError(409, 'ACCOUNT_CONFLICT', 'The account could not be created. Review the email and account details.')
        throw error
      }
    },
    create(identity: Identity, input: CreateCompanyInput) {
      return execute({ ...identity, method: 'POST', canonicalPath: '/api/v1/companies', request: input,
        authorize: async () => {},
        async execute(transaction, actor) {
          const repository = createCompanyRepository(transaction)
          const now = await repository.time()
          const company = await repository.create(randomUUID(), input, now)
          const rate = await repository.createRate({ id: randomUUID(), companyId: company.id, ...input.initialPayoutRate, createdByUserId: actor.userId, effectiveFrom: now, createdAt: now })
          return { outcome: 'succeeded', response: { status: 201, body: companyDto(company), headers: { Location: `/api/v1/companies/${company.id}` } }, audit: [
            { entityType: 'company', entityId: company.id, action: 'company.created', after: companyDto(company) },
            { entityType: 'company_payout_rate', entityId: rate.id, action: 'company.rate_created', after: rateDto(rate) },
          ] }
        },
      })
    },
    update(identity: Identity, id: string, input: PatchCompanyInput) {
      return execute({ ...identity, method: 'PATCH', canonicalPath: `/api/v1/companies/${id}`, request: input,
        authorize: async (transaction) => { await createCompanyRepository(transaction).find(id) },
        async execute(transaction) {
          const repository = createCompanyRepository(transaction)
          const before = await repository.lock(id)
          const after = await repository.update(id, input, await repository.time())
          return { outcome: 'succeeded', response: { status: 200, body: companyDto(after) }, audit: [{ entityType: 'company', entityId: id, action: 'company.updated', before: companyDto(before), after: companyDto(after) }] }
        },
      })
    },
    createRate(identity: Identity, id: string, input: CreateRateInput) {
      return execute({ ...identity, method: 'POST', canonicalPath: `/api/v1/companies/${id}/payout-rates`, request: input,
        authorize: async (transaction) => { await createCompanyRepository(transaction).find(id) },
        async execute(transaction, actor) {
          const repository = createCompanyRepository(transaction)
          await repository.lock(id)
          const previous = await repository.currentRate(id)
          if (!previous) throw new HttpError(409, 'RATE_HISTORY_INVALID', 'The company has no current payout rate.')
          const now = await repository.time()
          if (now <= previous.effectiveFrom) throw new HttpError(409, 'RATE_CHANGE_CONFLICT', 'The rate clock has not advanced. Retry the same intent.', 1)
          await repository.closeRate(previous.id, now)
          const rate = await repository.createRate({ id: randomUUID(), companyId: id, driverPercent: input.driverPercent, companyPercent: input.companyPercent, createdByUserId: actor.userId, effectiveFrom: now, createdAt: now })
          return { outcome: 'succeeded', response: { status: 201, body: rateDto(rate) }, audit: [{ entityType: 'company_payout_rate', entityId: rate.id, action: 'company.rate_created', before: rateDto(previous), after: { ...rateDto(rate), reason: input.reason } }] }
        },
      })
    },
  }
}
export type CompanyService = ReturnType<typeof createCompanyService>
