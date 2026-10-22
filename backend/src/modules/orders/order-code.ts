import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt } from 'node:crypto'
import { z } from 'zod'
const key = z.string().regex(/^[A-Za-z0-9_-]{43}$/).refine(value => Buffer.from(value, 'base64url').length === 32 && Buffer.from(value, 'base64url').toString('base64url') === value)
const keyId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
export function readOrderCodeCipher(env: NodeJS.ProcessEnv) {
 if (!env.TRIP_CODE_ENCRYPTION_KEY) {
  if (env.TRIP_CODE_PREVIOUS_KEYS) throw new Error('Invalid trip code configuration.')
  return undefined
 }
 try {
  const activeId = keyId.parse(env.TRIP_CODE_KEY_ID ?? 'local-v1')
  const active = key.parse(env.TRIP_CODE_ENCRYPTION_KEY)
  const previous = z.record(keyId, key).parse(JSON.parse(env.TRIP_CODE_PREVIOUS_KEYS || '{}'))
  if (Object.keys(previous).length > 10 || (previous[activeId] && previous[activeId] !== active)) throw new Error('Invalid ring')
  const ring = { ...previous, [activeId]: active }
  if (Object.values(ring).some(value => [env.AUTH_SESSION_KEY, env.COMMAND_FINGERPRINT_KEY, env.DOCUMENT_NUMBER_ENCRYPTION_KEY].includes(value))) throw new Error('Key reuse')
  const aad = (tripId: string, id: string) => Buffer.from(JSON.stringify(['hired-trip-code-v1', id, tripId]))
  return {
   generate(tripId: string) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
    const material = Buffer.from(active, 'base64url'); const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', material, iv)
    cipher.setAAD(aad(tripId, activeId))
    const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()])
    return { otpHash: createHmac('sha256', material).update('hired-trip-code-validation-v1\0').update(tripId).update('\0').update(code).digest('hex'), otpEncryptedValue: ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.'), otpKeyId: activeId }
   },
   decrypt(tripId: string, id: string, value: string) {
    const match = /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{8})$/.exec(value)
    if (!match || !ring[id]) throw new Error('Trip code key unavailable.')
    const cipher = createDecipheriv('aes-256-gcm', Buffer.from(ring[id], 'base64url'), Buffer.from(match[1]!, 'base64url'))
    cipher.setAAD(aad(tripId, id)); cipher.setAuthTag(Buffer.from(match[2]!, 'base64url'))
    return Buffer.concat([cipher.update(Buffer.from(match[3]!, 'base64url')), cipher.final()]).toString('utf8')
   },
  }
 } catch { throw new Error('Invalid trip code configuration.') }
}
export type OrderCodeCipher = NonNullable<ReturnType<typeof readOrderCodeCipher>>
