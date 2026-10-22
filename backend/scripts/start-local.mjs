import { spawn } from 'node:child_process'
import { loadLocalKeys, loadLocalDocumentKey, loadLocalTripCodeKey } from './local-keys.mjs'

let child
let stopping = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { stopping = true; child?.kill(signal) })
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    if (stopping) { reject(new Error('Local startup stopped.')); return }
    child = spawn(command, args, { stdio: 'inherit', env: process.env })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      child = undefined
      if (code === 0 || stopping) resolve()
      else reject(new Error(`Local startup command failed (${signal ?? code}).`))
    })
  })
}

try {
  if (process.env.NODE_ENV !== 'development' || process.env.LOCAL_COMPOSE_STARTUP !== 'true') {
    throw new Error('Automatic setup is only available through local development Compose.')
  }
  const password = process.env.LOCAL_ADMIN_PASSWORD
  if (!password || password.length < 15 || password.length > 128) {
    throw new Error('Set LOCAL_ADMIN_PASSWORD to 15–128 characters in the root .env file.')
  }
  const keys = { ...await loadLocalKeys('.local-state'), ...await loadLocalDocumentKey('.local-state'), ...await loadLocalTripCodeKey('.local-state') }
  for (const [name, value] of Object.entries(keys)) {
    if (!process.env[name]) process.env[name] = value
  }
  await run('pnpm', ['install', '--frozen-lockfile'])
  // Use only Compose's environment, never an unrelated host backend/.env.dev.
  await run(process.execPath, ['node_modules/prisma/build/index.js', 'generate'])
  await run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'])
  await run(process.execPath, ['--import', 'tsx', 'src/cli/prepare-local-admin.ts'])
  delete process.env.LOCAL_ADMIN_PASSWORD
  await run(process.execPath, ['--import', 'tsx', '--watch', 'src/index.ts'])
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
