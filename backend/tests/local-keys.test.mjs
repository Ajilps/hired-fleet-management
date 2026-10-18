import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadLocalKeys } from '../scripts/local-keys.mjs'

test('local keys survive restarts and remain private and independent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hired-local-keys-'))
  try {
    const first = await loadLocalKeys(directory)
    assert.deepEqual(await loadLocalKeys(directory), first)
    assert.notEqual(first.AUTH_SESSION_KEY, first.COMMAND_FINGERPRINT_KEY)
    for (const value of Object.values(first)) assert.equal(Buffer.from(value, 'base64url').length, 32)
    assert.equal((await stat(join(directory, 'keys.json'))).mode & 0o777, 0o600)
    await writeFile(join(directory, 'keys.json'), '{"AUTH_SESSION_KEY":"broken"}')
    await assert.rejects(loadLocalKeys(directory), /Invalid persisted local keys/)
    assert.equal(await readFile(join(directory, 'keys.json'), 'utf8'), '{"AUTH_SESSION_KEY":"broken"}')
    await writeFile(join(directory, 'keys.json'), 'private-corrupt-key-material')
    await assert.rejects(loadLocalKeys(directory), (error) => !error.message.includes('private-corrupt-key-material') && /Invalid persisted local keys/.test(error.message))
  } finally { await rm(directory, { recursive: true, force: true }) }
})
