import { createHash, createHmac } from 'node:crypto'
import { z } from 'zod'
import type { CommandInput, CommandOutcome, JsonValue } from './command-types.ts'
import { HttpError } from '../../shared/http/http-error.ts'

const metadata = z.object({
  method: z.enum(['POST', 'PATCH', 'DELETE']),
  canonicalPath: z.string().max(512).regex(/^\/api\/v1\/[a-z0-9]+(?:[-/][a-z0-9]+)*$/),
  key: z.string().min(1).max(100).regex(/^[A-Za-z0-9:_-]+$/),
  requestId: z.uuid(),
  ifMatch: z.string().max(200).optional(),
})
const secretKeys = new Set(['password', 'passwordhash', 'temporarypassword', 'accesstoken', 'refreshtoken', 'authorization', 'cookie', 'setcookie', 'closecode', 'otp', 'secret', 'signedurl', 'documentnumber', 'storagekey', 'requestid', 'token', 'downloadurl', 'uploadurl', 'presignedurl', 'otpcode', 'closecodehash', 'encryptedcode'])

export function canonicalJson(value: unknown, forbidSecrets = false): string {
  const seen = new Set<object>()
  function encode(item: unknown, depth: number): string {
    if (depth > 20) throw new Error('Command JSON exceeds the nesting limit.')
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return JSON.stringify(item)
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item)
    if (typeof item !== 'object' || item === null || seen.has(item)) throw new Error('Command data must be finite, acyclic JSON.')
    seen.add(item)
    try {
      if (Array.isArray(item)) return `[${Array.from(item, (child) => encode(child, depth + 1)).join(',')}]`
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new Error('Command data must use plain JSON objects.')
      const record = item as Record<string, unknown>
      return `{${Object.keys(record).sort().map((key) => {
        if (forbidSecrets && secretKeys.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase())) throw new Error('Sensitive fields cannot be stored in command results or audit.')
        return `${JSON.stringify(key)}:${encode(record[key], depth + 1)}`
      }).join(',')}}`
    } finally { seen.delete(item) }
  }
  const result = encode(value, 0)
  if (Buffer.byteLength(result) > 48 * 1024) throw new Error('Command JSON exceeds the storage limit.')
  return result
}

export function validateCommand(input: CommandInput) {
  if (!metadata.safeParse(input).success) throw new HttpError(422, 'VALIDATION_FAILED', 'Command identity or precondition is invalid.')
  // Freeze the fingerprint material before entering asynchronous transaction work.
  return canonicalJson({ request: input.request, ifMatch: input.ifMatch ?? null })
}
export function fingerprintRequest(normalized: string, key: Uint8Array) { return createHmac('sha256', key).update(normalized).digest('hex') }
export function commandLockId(scope: unknown) { return BigInt.asIntN(64, BigInt(`0x${createHash('sha256').update(canonicalJson(scope)).digest('hex').slice(0, 16)}`)) }

export function validateOutcome(result: CommandOutcome) {
  const { status, headers = {}, body } = result.response
  if (!Number.isInteger(status) || (result.outcome === 'succeeded' ? status < 200 || status > 299 : status < 400 || status > 499)) throw new Error('Invalid durable command outcome.')
  if (result.outcome !== 'succeeded' && result.outcome !== 'rejected') throw new Error('Invalid durable command outcome.')
  if (status === 204 && body !== null) throw new Error('A 204 command response cannot contain a body.')
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value !== 'string' || value.length > 512 || /[\r\n]/.test(value) || !['ETag', 'Location'].includes(name)) throw new Error('Unsafe replay response header.')
    if (name === 'ETag' && !/^"[\x21\x23-\x7e]+"$/.test(value)) throw new Error('A strong response ETag is required.')
    if (name === 'Location' && !/^\/api\/v1\/[a-z0-9/-]+$/.test(value)) throw new Error('A canonical resource Location is required.')
  }
  if (!result.audit.length || result.audit.length > 20) throw new Error('A command must supply bounded audit events.')
  for (const change of result.audit) {
    if (!z.uuid().safeParse(change.entityId).success || !/^[a-z][a-z0-9_]{0,49}$/.test(change.entityType) || !/^[a-z][a-z0-9_.-]{0,79}$/.test(change.action)) throw new Error('Invalid audit identity.')
    if (change.before !== undefined) canonicalJson(change.before, true)
    if (change.after !== undefined) canonicalJson(change.after, true)
  }
  canonicalJson(body, true)
  return { status, body: JSON.parse(canonicalJson(body, true)) as JsonValue, headers: { ...headers } }
}
