import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { HttpError } from '../../shared/http/http-error.ts'

export type AccountPosition = { id: string; createdAt: string }
const payloadSchema = z.strictObject({ v: z.literal(1), scope: z.string(), id: z.uuid(), createdAt: z.iso.datetime({ precision: 6 }) })
export function createAccountCursor(key: Uint8Array) {
  const sign = (value: string) => createHmac('sha256', key).update('hired-account-cursor-v1\0').update(value).digest()
  return {
    encode(scope: string, position: AccountPosition) {
      const payload = Buffer.from(JSON.stringify({ v: 1, scope, ...position })).toString('base64url')
      return `${payload}.${sign(payload).toString('base64url')}`
    },
    decode(scope: string, cursor: string | undefined): AccountPosition | undefined {
      if (!cursor) return undefined
      try {
        const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(cursor)
        if (!match || Buffer.from(match[1]!, 'base64url').toString('base64url') !== match[1] || Buffer.from(match[2]!, 'base64url').toString('base64url') !== match[2] || !timingSafeEqual(sign(match[1]!), Buffer.from(match[2]!, 'base64url'))) throw new Error('Invalid cursor')
        const value = payloadSchema.parse(JSON.parse(Buffer.from(match[1]!, 'base64url').toString('utf8')))
        if (value.scope !== scope) throw new Error('Wrong scope')
        return { id: value.id, createdAt: value.createdAt }
      } catch { throw new HttpError(422, 'VALIDATION_FAILED', 'The account cursor is invalid for this request.') }
    },
  }
}
