import { z } from 'zod'

const schema = z.object({
  AUTH_SESSION_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/).refine((value) => Buffer.from(value, 'base64url').length === 32),
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  AUTH_REFRESH_TTL_SECONDS: z.coerce.number().int().min(3600).max(2_592_000).default(604_800),
  AUTH_LOGIN_IP_LIMIT: z.coerce.number().int().min(1).max(1000).default(60),
  AUTH_LOGIN_ACCOUNT_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  AUTH_REFRESH_IP_LIMIT: z.coerce.number().int().min(1).max(1000).default(120),
})

export function readAuthConfig(source: NodeJS.ProcessEnv) {
  const result = schema.safeParse(source)
  if (!result.success) throw new Error('Invalid authentication configuration. Check AUTH_SESSION_KEY and AUTH_* limits; values are not logged.')
  return {
    key: Buffer.from(result.data.AUTH_SESSION_KEY, 'base64url'),
    accessTtlSeconds: result.data.AUTH_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: result.data.AUTH_REFRESH_TTL_SECONDS,
    loginIpLimit: result.data.AUTH_LOGIN_IP_LIMIT,
    loginAccountLimit: result.data.AUTH_LOGIN_ACCOUNT_LIMIT,
    refreshIpLimit: result.data.AUTH_REFRESH_IP_LIMIT,
    isSecureCookie: source.NODE_ENV === 'production',
  }
}
export type AuthConfig = ReturnType<typeof readAuthConfig>
