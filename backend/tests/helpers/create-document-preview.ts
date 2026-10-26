// Disposable synthetic fixture only; this does not claim a new ClamAV scan.
import { readFileSync } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import { z } from 'zod'
import { createDatabase } from '../../src/database/database-client.ts'
import { readEnvironment } from '../../src/config/environment.ts'
import { createPrivateObjectStore, readStorageConfig } from '../../src/modules/files/index.ts'
if (process.env.NODE_ENV !== 'test' || !process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.TEST_DATABASE_URL).hostname)) throw new Error('Preview fixture requires explicit disposable loopback test database.')
const input = z.strictObject({ driverId: z.uuid(), userId: z.uuid(), bytes: z.string() }).parse(JSON.parse(readFileSync(0, 'utf8')))
const bytes = Buffer.from(input.bytes, 'base64'); const id = randomUUID()
const database = createDatabase(readEnvironment(process.env)); const store = createPrivateObjectStore(readStorageConfig(process.env))
try {
  await store.put(id, bytes, 5242880)
  await database.client.fileAsset.create({ data: { id, driverId: input.driverId, uploadedByUserId: input.userId, storageKey: `quarantine/${id}`, originalFilename: 'synthetic-preview.png', mimeType: 'image/png', byteSize: BigInt(bytes.length), checksumSha256: createHash('sha256').update(bytes).digest('hex'), malwareScanStatus: 'clean', purpose: 'driver_document', createdAt: new Date() } })
  console.log(id)
} finally { store.close(); await database.close() }
