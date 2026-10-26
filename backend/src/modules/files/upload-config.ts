import { z } from 'zod'

export function readUploadConfig(source: NodeJS.ProcessEnv) {
  const result = z.object({ PRIVATE_UPLOADS_ENABLED: z.enum(['true', 'false']).default('false'), FILE_UPLOAD_ATTEMPTS_PER_MINUTE: z.coerce.number().int().min(1).max(100).default(12) }).safeParse(source)
  if (!result.success) throw new Error('Invalid private storage configuration. Check PRIVATE_UPLOADS_ENABLED and FILE_UPLOAD_ATTEMPTS_PER_MINUTE.')
  return { isEnabled: result.data.PRIVATE_UPLOADS_ENABLED === 'true', attemptsPerMinute: result.data.FILE_UPLOAD_ATTEMPTS_PER_MINUTE }
}
