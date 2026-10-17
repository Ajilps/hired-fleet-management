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
      // A reachable empty database is not ready to serve the identity module.
      await client.$queryRaw`SELECT id FROM users LIMIT 0`
      await client.$queryRaw`SELECT id FROM auth_sessions LIMIT 0`
    },
    async close() { await client.$disconnect() },
  }
}
