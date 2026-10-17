import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { HttpError } from '../../shared/http/http-error.ts'

const cursorSchema = z.strictObject({ v: z.literal(1), scope: z.string(), createdAt: z.iso.datetime({ precision: 3 }), id: z.uuid() })
export function createCompanyCursor(key: Uint8Array) {
  const sign = (payload: string) => createHmac('sha256', key).update('hired-company-cursor-v1\0').update(payload).digest()
  return {
    encode(scope: string, anchor: { createdAt: Date; id: string }) {
      const payload = Buffer.from(JSON.stringify({ v: 1, scope, createdAt: anchor.createdAt.toISOString(), id: anchor.id })).toString('base64url')
      return `${payload}.${sign(payload).toString('base64url')}`
    },
    decode(scope: string, value: string | undefined) {
      if (!value) return undefined
      try {
        const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(value)
        if (!match || !timingSafeEqual(sign(match[1]!), Buffer.from(match[2]!, 'base64url'))) throw new Error('Invalid cursor')
        if (Buffer.from(match[1]!, 'base64url').toString('base64url') !== match[1] || Buffer.from(match[2]!, 'base64url').toString('base64url') !== match[2]) throw new Error('Noncanonical cursor')
        const result = cursorSchema.parse(JSON.parse(Buffer.from(match[1]!, 'base64url').toString('utf8')))
        if (result.scope !== scope) throw new Error('Invalid scope')
        return { createdAt: new Date(result.createdAt), id: result.id }
      } catch { throw new HttpError(422, 'VALIDATION_FAILED', 'The company cursor is invalid for this request.') }
    },
  }
}
