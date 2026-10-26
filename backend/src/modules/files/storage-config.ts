import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  STORAGE_ENDPOINT: z.url(),
  STORAGE_PUBLIC_ENDPOINT: z.url().optional(),
  STORAGE_REGION: z.string().regex(/^[a-z0-9-]{1,64}$/),
  STORAGE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  STORAGE_ACCESS_KEY_ID: z.string().min(1).max(256),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1).max(256),
  STORAGE_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true'),
  STORAGE_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(5000),
}).superRefine((value, context) => {
  if (!URL.canParse(value.STORAGE_ENDPOINT)) return
  const endpoint = new URL(value.STORAGE_ENDPOINT)
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
  const isLocal = value.NODE_ENV !== 'production' && (isLoopback || endpoint.hostname === 'seaweedfs')
  if ((endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && isLocal))
    || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    context.addIssue({ code: 'custom', path: ['STORAGE_ENDPOINT'], message: 'Use an HTTPS origin, or an explicit local development storage origin.' })
  }
  if (value.STORAGE_PUBLIC_ENDPOINT) {
    if (!URL.canParse(value.STORAGE_PUBLIC_ENDPOINT)) {
      context.addIssue({ code: 'custom', path: ['STORAGE_PUBLIC_ENDPOINT'], message: 'Invalid public storage origin.' })
      return
    }
    const publicEndpoint = new URL(value.STORAGE_PUBLIC_ENDPOINT)
    const localPublic = value.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(publicEndpoint.hostname)
    if ((publicEndpoint.protocol !== 'https:' && !(publicEndpoint.protocol === 'http:' && localPublic))
      || publicEndpoint.username || publicEndpoint.password || publicEndpoint.search || publicEndpoint.hash || publicEndpoint.pathname !== '/') {
      context.addIssue({ code: 'custom', path: ['STORAGE_PUBLIC_ENDPOINT'], message: 'Use a browser-reachable HTTPS origin or explicit local loopback origin.' })
    }
  }
})

// Read only when a storage consumer starts; metadata/auth do not require storage.
// Explicit credentials avoid accidentally adopting a developer's global AWS identity.
export function readStorageConfig(source: NodeJS.ProcessEnv) {
  const result = schema.safeParse(source)
  if (!result.success) throw new Error('Invalid private storage configuration. See backend/.env.example.')
  const value = result.data
  return {
    endpoint: value.STORAGE_ENDPOINT,
    publicEndpoint: value.STORAGE_PUBLIC_ENDPOINT ?? value.STORAGE_ENDPOINT,
    region: value.STORAGE_REGION,
    bucket: value.STORAGE_BUCKET,
    accessKeyId: value.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: value.STORAGE_SECRET_ACCESS_KEY,
    forcePathStyle: value.STORAGE_FORCE_PATH_STYLE === 'true',
    timeoutMs: value.STORAGE_TIMEOUT_MS,
  }
}
export type StorageConfig = ReturnType<typeof readStorageConfig>
