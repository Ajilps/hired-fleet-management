import { createConnection } from 'node:net'
import { z } from 'zod'
import { HttpError } from '../../shared/http/http-error.ts'
import { MAX_UPLOAD_BYTES } from './upload-policy.ts'

const schema = z.object({ CLAMAV_HOST: z.string().regex(/^[a-zA-Z0-9.:-]{1,253}$/).default('127.0.0.1'), CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310), CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(5000) })
export function readScannerConfig(source: NodeJS.ProcessEnv) {
  const result = schema.safeParse(source)
  if (!result.success) throw new Error('Invalid scanner configuration. See backend/.env.example.')
  return { host: result.data.CLAMAV_HOST, port: result.data.CLAMAV_PORT, timeoutMs: result.data.CLAMAV_TIMEOUT_MS }
}
function unavailable() { return new HttpError(503, 'SCANNER_UNAVAILABLE', 'Malware scanning is unavailable. Retry the same upload intent.', 1) }
export function createClamAvScanner(config: ReturnType<typeof readScannerConfig>) {
  function command(command: 'VERSION' | 'INSTREAM', bytes?: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: config.host, port: config.port }); let reply = Buffer.alloc(0); let settled = false
      const deadline = setTimeout(() => finish(), config.timeoutMs); deadline.unref()
      function finish(value?: string) { if (settled) return; settled = true; clearTimeout(deadline); socket.destroy(); if (value === undefined) reject(unavailable()); else resolve(value) }
      socket.on('error', () => finish())
      socket.on('connect', () => {
        socket.write(`z${command}\0`)
        if (bytes) {
          for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
            const chunk = bytes.subarray(offset, offset + 64 * 1024); const length = Buffer.alloc(4); length.writeUInt32BE(chunk.length)
            socket.write(length); socket.write(chunk)
          }
          socket.write(Buffer.alloc(4))
        }
      })
      socket.on('data', (chunk: Buffer) => { if (reply.length + chunk.length > 4096) { finish(); return }; reply = Buffer.concat([reply, chunk]) })
      socket.on('end', () => finish(reply.toString('utf8')))
      socket.on('close', () => { if (!settled) finish() })
    })
  }
  return {
    async scan(bytes: Buffer): Promise<'clean' | 'rejected'> {
      if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw unavailable()
      // A responsive daemon without a current signature database is not sufficient.
      const version = await command('VERSION')
      const match = /^ClamAV [^/\0]+\/\d+\/([^\0]+)\0$/.exec(version)
      const signatureTime = match ? Date.parse(`${match[1]} GMT`) : NaN
      const age = Date.now() - signatureTime
      if (!Number.isFinite(signatureTime) || age < -60 * 60 * 1000 || age > 72 * 60 * 60 * 1000) throw unavailable()
      const result = await command('INSTREAM', bytes)
      if (result === 'stream: OK\0') return 'clean'
      if (/^stream: [^\0\r\n]+ FOUND\0$/.test(result)) return 'rejected'
      throw unavailable()
    },
  }
}
