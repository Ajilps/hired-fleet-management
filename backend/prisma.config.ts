import { defineConfig } from 'prisma/config'

const databaseUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Offline generation needs no connection string. Migration commands require one.
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
})
