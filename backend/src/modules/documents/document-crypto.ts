import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { HttpError } from '../../shared/http/http-error.ts'

const keySchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/).refine(value => Buffer.from(value, 'base64url').length === 32)
const keyIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
export type DocumentContext = { id: string; driverId: string; documentType: string; fileAssetId: string }
function aad(context: DocumentContext, keyId: string) { return Buffer.from(JSON.stringify(['hired-document-number-v1', keyId, context.id, context.driverId, context.documentType, context.fileAssetId])) }
export function readDocumentCipher(source: NodeJS.ProcessEnv) {
  if (!source.DOCUMENT_NUMBER_ENCRYPTION_KEY) {
    if (source.DOCUMENT_NUMBER_PREVIOUS_KEYS) throw new Error('Invalid document encryption configuration.')
    return undefined
  }
  try {
    const activeId = keyIdSchema.parse(source.DOCUMENT_NUMBER_KEY_ID ?? 'local-v1')
    const activeKey = keySchema.parse(source.DOCUMENT_NUMBER_ENCRYPTION_KEY)
    const previous = z.record(keyIdSchema, keySchema).parse(JSON.parse(source.DOCUMENT_NUMBER_PREVIOUS_KEYS || '{}'))
    if ((previous[activeId] && previous[activeId] !== activeKey) || Object.keys(previous).length > 10) throw new Error('Invalid key ring')
    const values = { ...previous, [activeId]: activeKey }
    if (Object.values(values).some(value => [source.AUTH_SESSION_KEY, source.COMMAND_FINGERPRINT_KEY].some(other => other && Buffer.from(value, 'base64url').equals(Buffer.from(other, 'base64url'))))) throw new Error('Keys must be independent')
    const keys = new Map(Object.entries(values).map(([id, value]) => [id, Buffer.from(value, 'base64url')]))
    return {
      encrypt(value: string, context: DocumentContext) {
        const iv = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', keys.get(activeId)!, iv, { authTagLength: 16 })
        cipher.setAAD(aad(context, activeId))
        const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
        return { documentNumberCiphertext: ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.'), documentNumberKeyId: activeId, maskedDocumentNumber: value.length > 4 ? `****${value.slice(-4)}` : '****' }
      },
      // Internal recovery helper only; no HTTP endpoint returns decrypted numbers.
      decrypt(value: string, keyId: string, context: DocumentContext) {
        try {
          const match = /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]+)$/.exec(value)
          const key = keys.get(keyId)
          if (!match || !key || value.length > 1024) throw new Error('Invalid ciphertext')
          const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(match[1]!, 'base64url'), { authTagLength: 16 })
          decipher.setAAD(aad(context, keyId)); decipher.setAuthTag(Buffer.from(match[2]!, 'base64url'))
          return Buffer.concat([decipher.update(Buffer.from(match[3]!, 'base64url')), decipher.final()]).toString('utf8')
        } catch { throw new HttpError(503, 'DOCUMENT_KEY_UNAVAILABLE', 'The protected document number could not be read.') }
      },
    }
  } catch { throw new Error('Invalid document encryption configuration.') }
}
export type DocumentCipher = NonNullable<ReturnType<typeof readDocumentCipher>>
