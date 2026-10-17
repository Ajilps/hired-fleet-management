import type { Prisma } from '../../generated/prisma/client.ts'

declare const workflowBrand: unique symbol
export type WorkflowTransaction = Omit<Prisma.TransactionClient, '$queryRawUnsafe' | '$executeRawUnsafe'> & { readonly [workflowBrand]: true }
const activeTransactions = new WeakSet<object>()

export function assertWorkflowTransaction(transaction: object): asserts transaction is WorkflowTransaction {
  if (!activeTransactions.has(transaction)) throw new Error('An active workflow transaction is required.')
}

export async function withWorkflowTransaction<T>(transaction: Prisma.TransactionClient, run: (transaction: WorkflowTransaction) => Promise<T>) {
  if (typeof Reflect.get(transaction, '$connect') === 'function' || typeof Reflect.get(transaction, '$disconnect') === 'function') throw new Error('A full database client cannot be used as a workflow transaction.')
  // Prisma 7.10 exposes a runtime $transaction on its transaction proxy even
  // though TransactionClient omits it. Hide lifecycle/nesting/unsafe APIs here.
  const denied = new Set(['$transaction', '$connect', '$disconnect', '$extends', '$on', '$use', '$parent', '$queryRawUnsafe', '$executeRawUnsafe'])
  const context = new Proxy(transaction, {
    get(target, property) { return denied.has(String(property)) ? undefined : Reflect.get(target, property, target) },
    has(target, property) { return !denied.has(String(property)) && Reflect.has(target, property) },
  })
  activeTransactions.add(context)
  assertWorkflowTransaction(context)
  try { return await run(context) } finally { activeTransactions.delete(context) }
}
