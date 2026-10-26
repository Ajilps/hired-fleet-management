import { z } from 'zod'

const integer = (fallback: number, max: number) => z.coerce.number().int().positive().max(max).default(fallback)
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: integer(3000, 65535),
  DATABASE_URL: z.url().refine((value) => {
    if (!URL.canParse(value)) return false
    const url = new URL(value)
    return ['postgres:', 'postgresql:'].includes(url.protocol)
      && (!url.searchParams.has('schema') || url.searchParams.get('schema') === 'public')
  }),
  DATABASE_POOL_MAX: integer(10, 100),
  DATABASE_CONNECT_TIMEOUT_MS: integer(2000, 30_000),
  DATABASE_QUERY_TIMEOUT_MS: integer(3000, 30_000),
  CORS_ORIGINS: z.string().default('').transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.url().refine((value) => {
      if (!URL.canParse(value)) return false
      const url = new URL(value)
      return ['http:', 'https:'].includes(url.protocol) && url.origin === value
    }))),
})

export function readEnvironment(source: NodeJS.ProcessEnv) {
  const result = environmentSchema.safeParse(source)
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))].join(', ')
    throw new Error(`Invalid backend configuration: ${fields}. See backend/.env.example.`)
  }
  const config = result.data
  return {
    nodeEnv: config.NODE_ENV,
    host: config.HOST,
    port: config.PORT,
    databaseUrl: config.DATABASE_URL,
    databasePoolMax: config.DATABASE_POOL_MAX,
    databaseConnectTimeoutMs: config.DATABASE_CONNECT_TIMEOUT_MS,
    databaseQueryTimeoutMs: config.DATABASE_QUERY_TIMEOUT_MS,
    corsOrigins: config.CORS_ORIGINS,
  }
}

export type Environment = ReturnType<typeof readEnvironment>
