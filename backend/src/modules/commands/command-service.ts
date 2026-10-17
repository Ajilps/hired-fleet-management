import { timingSafeEqual } from 'node:crypto'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import { authenticateTransaction } from '../auth/index.ts'
import type { AuthConfig } from '../auth/index.ts'
import { lockAccountAdministration } from '../../shared/database/account-administration-lock.ts'
import { withWorkflowTransaction } from '../../shared/database/workflow-transaction.ts'
import { HttpError } from '../../shared/http/http-error.ts'
import { createCommandRepository } from './command-repository.ts'
import { fingerprintRequest, validateCommand, validateOutcome } from './command-validation.ts'
import type { CommandInput, CommandResult, CommandResponse, JsonValue } from './command-types.ts'

export function createCommandExecutor(client: PrismaClient, config: { auth: AuthConfig; fingerprintKey: Uint8Array }) {
  if (config.fingerprintKey.length !== 32 || timingSafeEqual(config.fingerprintKey, config.auth.key)) throw new Error('Invalid command configuration. Commands require an independent 32-byte fingerprint key.')
  const fingerprintKey = Uint8Array.from(config.fingerprintKey)
  return async function executeCommand(input: CommandInput): Promise<CommandResult> {
    const fingerprint = fingerprintRequest(validateCommand(input), fingerprintKey)
    for (let attempt = 0; ; attempt++) {
      try {
        return await client.$transaction((transaction) => withWorkflowTransaction(transaction, async (context) => {
          if (input.serializeAccountStatus) await lockAccountAdministration(context)
          const principal = await authenticateTransaction(context, input.accessToken, config.auth)
          const actor = { userId: principal.userId, sessionId: principal.sessionId, role: 'admin' as const }
          await input.authorize(context, actor)
          const repository = createCommandRepository(context)
          const scope = { actorUserId: actor.userId, requestMethod: input.method, canonicalPath: input.canonicalPath, idempotencyKey: input.key }
          if (!await repository.tryLock(scope)) throw new HttpError(409, 'COMMAND_IN_PROGRESS', 'This command is still running. Retry the same key and input.', 1)
          const previous = await repository.find(scope)
          if (previous && previous.expiresAt > new Date()) {
            if (previous.requestFingerprint !== fingerprint) throw new HttpError(409, 'IDEMPOTENCY_KEY_REUSED', 'This key was already used with different input.')
            return { replayed: true, response: { status: previous.responseStatus, body: previous.responseBody as JsonValue, headers: previous.responseHeaders as CommandResponse['headers'] } }
          }
          if (previous) await repository.removeExpired(previous.id)
          const outcome = await input.execute(context, actor)
          const response = validateOutcome(outcome)
          await repository.persist(actor.userId, input, fingerprint, outcome, response)
          return { replayed: false, response }
        }), { isolationLevel: 'ReadCommitted', maxWait: 2000, timeout: 5000 })
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
        if (code !== 'P2034') throw error
        if (attempt >= 2) throw new HttpError(503, 'COMMAND_RETRY_REQUIRED', 'The command could not complete. Retry the same key and input.', 1)
      }
    }
  }
}
