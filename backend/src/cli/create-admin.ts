import { parseArgs } from 'node:util'
import { readEnvironment } from '../config/environment.ts'
import { createDatabase } from '../database/database-client.ts'
import { createAdminAccount } from '../modules/auth/index.ts'

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } })
const database = createDatabase(readEnvironment(process.env))
try {
  const input = { email: values.email, fullName: values.name, password: process.env.ADMIN_BOOTSTRAP_PASSWORD }
  delete process.env.ADMIN_BOOTSTRAP_PASSWORD
  await createAdminAccount(database.client, input)
  console.info('Admin created. No credentials were printed.')
} catch {
  console.error('Admin creation failed. Check email/name, a unique account and ADMIN_BOOTSTRAP_PASSWORD (15–128 characters). No existing account was changed.')
  process.exitCode = 1
} finally { await database.close() }
