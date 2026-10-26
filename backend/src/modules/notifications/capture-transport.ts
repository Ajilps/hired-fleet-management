import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile, link, unlink, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { NotificationTransport } from './notification-worker.ts'
export function createCaptureTransport(env: NodeJS.ProcessEnv): NotificationTransport {
 if (!['development', 'test'].includes(env.NODE_ENV ?? '') || env.NOTIFICATION_TRANSPORT !== 'capture') throw new Error('Capture mail requires an explicit development/test configuration.')
 const directory = resolve(env.NOTIFICATION_CAPTURE_DIRECTORY ?? '.local-state/mail')
 return { async send(row) {
  if (!row.recipientEmail || !['order_accepted', 'order_rejected', 'statement_published'].includes(row.eventType)) throw new Error('Unsupported capture intent.')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  // One complete immutable file per intent. Hard-link publication is atomic;
  // retries after provider acceptance return the same capture identity.
  const message = JSON.stringify({ notificationId: row.id, to: row.recipientEmail, subject: row.eventType === 'statement_published' ? 'Your HireD monthly statement is published' : row.eventType === 'order_accepted' ? 'Your HireD order was accepted' : 'Your HireD order was rejected', payload: row.payload })
  const id = createHash('sha256').update(message).digest('hex')
  const path = join(directory, `${row.id}.json`); const temporary = join(directory, `${row.id}.${randomUUID()}.tmp`)
  await writeFile(temporary, message, { flag: 'wx', mode: 0o600 })
  try {
   try { await link(temporary, path) } catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') throw error; if (await readFile(path, 'utf8') !== message) throw new Error('Capture identity conflict.', { cause: error }) }
  } finally { await unlink(temporary).catch(() => undefined) }
  return `capture:${id}`
 } }
}
