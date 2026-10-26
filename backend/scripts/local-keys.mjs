import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Local Compose only. Persist these independently of container/node_modules lifetime.
async function loadPersistedKeys(directory, filename, names) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, filename)
  try {
    const keys = Object.fromEntries(names.map((name) => [name, randomBytes(32).toString('base64url')]))
    await writeFile(path, JSON.stringify(keys), { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  let keys
  try { keys = JSON.parse(await readFile(path, 'utf8')) } catch {
    throw new Error('Invalid persisted local keys; restore the local key volume before restarting.')
  }
  if (!keys || names.some((name) => typeof keys[name] !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(keys[name]))) {
    throw new Error('Invalid persisted local keys; restore the local key volume before restarting.')
  }
  return Object.fromEntries(names.map((name) => [name, keys[name]]))
}

export function loadLocalKeys(directory) { return loadPersistedKeys(directory, 'keys.json', ['AUTH_SESSION_KEY', 'COMMAND_FINGERPRINT_KEY']) }
export function loadLocalDocumentKey(directory) { return loadPersistedKeys(directory, 'document-key.json', ['DOCUMENT_NUMBER_ENCRYPTION_KEY']) }

export function loadLocalTripCodeKey(directory) { return loadPersistedKeys(directory, 'trip-code-key.json', ['TRIP_CODE_ENCRYPTION_KEY']) }
