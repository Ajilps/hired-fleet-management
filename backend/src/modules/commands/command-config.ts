import { z } from 'zod'

export function readCommandConfig(source: NodeJS.ProcessEnv) {
  const result = z.string().regex(/^[A-Za-z0-9_-]{43}$/).refine((value) => Buffer.from(value, 'base64url').length === 32).safeParse(source.COMMAND_FINGERPRINT_KEY)
  if (!result.success) throw new Error('Invalid command configuration. Generate an independent COMMAND_FINGERPRINT_KEY; values are not logged.')
  return { fingerprintKey: Buffer.from(result.data, 'base64url') }
}
