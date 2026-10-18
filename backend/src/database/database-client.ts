import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.ts'
import type { Environment } from '../config/environment.ts'

export function createDatabase(config: Environment) {
  const adapter = new PrismaPg({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    connectionTimeoutMillis: config.databaseConnectTimeoutMs,
    idleTimeoutMillis: 10_000,
    query_timeout: config.databaseQueryTimeoutMs,
    statement_timeout: config.databaseQueryTimeoutMs,
  })
  const client = new PrismaClient({ adapter })
  return {
    client,
    async checkReady() {
      // Readiness requires the implemented identity and workflow schema.
      await client.$queryRaw`SELECT id, password_change_required FROM users LIMIT 0`
      await client.$queryRaw`SELECT id FROM auth_sessions LIMIT 0`
      await client.$queryRaw`SELECT token_hash FROM auth_refresh_tokens LIMIT 0`
      await client.$queryRaw`SELECT key_hash FROM auth_rate_limits LIMIT 0`
      await client.$queryRaw`SELECT id FROM command_replays LIMIT 0`
      await client.$queryRaw`SELECT id FROM audit_logs LIMIT 0`
      await client.$queryRaw`SELECT id FROM companies LIMIT 0`
      await client.$queryRaw`SELECT company_id FROM company_users LIMIT 0`
      await client.$queryRaw`SELECT id FROM company_payout_rates LIMIT 0`
      await client.$queryRaw`SELECT id, user_id FROM drivers LIMIT 0`
    },
    async close() { await client.$disconnect() },
  }
}
