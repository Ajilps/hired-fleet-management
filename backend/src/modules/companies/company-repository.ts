import type { Prisma } from '../../generated/prisma/client.ts'
import { assertWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import type { WorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import type { CreateCompanyInput, PatchCompanyInput } from './company-validator.ts'

type Anchor = { createdAt: Date; id: string } | undefined
const after = (anchor: Anchor) => anchor ? { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}
const order = [{ createdAt: 'desc' as const }, { id: 'desc' as const }]
export function createCompanyRepository(transaction: WorkflowTransaction) {
  assertWorkflowTransaction(transaction)
  async function find(id: string) {
    const company = await transaction.company.findUnique({ where: { id } })
    if (!company) throw new HttpError(404, 'NOT_FOUND', 'Company not found.')
    return company
  }
  return {
    find,
    async lock(id: string) {
      await transaction.$queryRaw`SELECT id FROM companies WHERE id = ${id}::uuid FOR UPDATE`
      return find(id)
    },
    async time() { return (await transaction.$queryRaw<{ now: Date }[]>`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`)[0]!.now },
    async list(limit: number, anchor: Anchor) {
      const totalCount = await transaction.company.count()
      const items = await transaction.company.findMany({ where: after(anchor), orderBy: order, take: limit + 1 })
      return { totalCount, items }
    },
    async rates(companyId: string, limit: number, anchor: Anchor) {
      const totalCount = await transaction.companyPayoutRate.count({ where: { companyId } })
      const items = await transaction.companyPayoutRate.findMany({ where: { companyId, ...after(anchor) }, orderBy: order, take: limit + 1 })
      return { totalCount, items }
    },
    create(id: string, input: CreateCompanyInput, now: Date) {
      const { legalName, displayName, contactName, contactEmail, contactPhone, billingAddress } = input
      return transaction.company.create({ data: { id, legalName, displayName, contactName, contactEmail, contactPhone, billingAddress, createdAt: now, updatedAt: now } })
    },
    update(id: string, input: PatchCompanyInput, now: Date) { return transaction.company.update({ where: { id }, data: { ...input, updatedAt: now } }) },
    currentRate(companyId: string) { return transaction.companyPayoutRate.findFirst({ where: { companyId, effectiveTo: null } }) },
    closeRate(id: string, effectiveTo: Date) { return transaction.companyPayoutRate.update({ where: { id }, data: { effectiveTo } }) },
    createRate(data: Prisma.CompanyPayoutRateUncheckedCreateInput) { return transaction.companyPayoutRate.create({ data }) },
  }
}
