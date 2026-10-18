import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { HttpError } from '../../shared/http/http-error.ts'
import type { StorageConfig } from './storage-config.ts'

function storageKey(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error('A canonical file asset UUID is required.')
  return `quarantine/${id}`
}
function requireBound(maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('A positive safe byte bound is required.')
}
function unavailable() { return new HttpError(503, 'STORAGE_UNAVAILABLE', 'Private storage could not complete the operation.', 1) }

// Internal byte adapter, not an HTTP upload/attachment/download service. Callers
// must authorize, validate content and persist durable workflow state separately.
export function createPrivateObjectStore(config: StorageConfig) {
  const client = new S3Client({
    endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 1,
    requestHandler: { connectionTimeout: config.timeoutMs, requestTimeout: config.timeoutMs },
  })
  return {
    async put(id: string, bytes: Uint8Array, maxBytes: number) {
      const key = storageKey(id); requireBound(maxBytes)
      if (!bytes.byteLength || bytes.byteLength > maxBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'File bytes are outside the permitted size bound.')
      try {
        await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: bytes,
          ContentLength: bytes.byteLength, ContentType: 'application/octet-stream', CacheControl: 'no-store',
          IfNoneMatch: '*', ChecksumSHA256: createHash('sha256').update(bytes).digest('base64'),
        }), { abortSignal: AbortSignal.timeout(config.timeoutMs) })
        return { storageKey: key, sizeBytes: bytes.byteLength, checksumSha256: createHash('sha256').update(bytes).digest('hex') }
      } catch (error) {
        if (error && typeof error === 'object' && '$metadata' in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 412) {
          throw new HttpError(409, 'STORAGE_OBJECT_EXISTS', 'The private object already exists; reconcile the existing upload intent.')
        }
        throw unavailable()
      }
    },
    async read(id: string, maxBytes: number, checksumSha256: string) {
      const key = storageKey(id); requireBound(maxBytes)
      if (!/^[0-9a-f]{64}$/.test(checksumSha256)) throw new Error('A canonical SHA-256 checksum is required.')
      let body: Readable | undefined
      const controller = new AbortController()
      const deadline = setTimeout(() => { controller.abort(); body?.destroy(new Error('Private object read deadline exceeded.')) }, config.timeoutMs)
      deadline.unref()
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: controller.signal })
        if (!(result.Body instanceof Readable)) throw unavailable()
        body = result.Body
        if (controller.signal.aborted) throw unavailable()
        if (result.ContentLength !== undefined && (result.ContentLength < 1 || result.ContentLength > maxBytes)) throw unavailable()
        const chunks: Buffer[] = []; let sizeBytes = 0; const hash = createHash('sha256')
        for await (const chunk of body) {
          const bytes = Buffer.from(chunk as Uint8Array)
          sizeBytes += bytes.byteLength
          if (sizeBytes > maxBytes) throw unavailable()
          chunks.push(bytes); hash.update(bytes)
        }
        if (!sizeBytes || (result.ContentLength !== undefined && result.ContentLength !== sizeBytes) || hash.digest('hex') !== checksumSha256) throw unavailable()
        return Buffer.concat(chunks, sizeBytes)
      } catch { throw unavailable() }
      finally { clearTimeout(deadline); body?.destroy() }
    },
    async remove(id: string) {
      const key = storageKey(id)
      try { await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(config.timeoutMs) }) }
      catch { throw unavailable() }
    },
    close() { client.destroy() },
  }
}
