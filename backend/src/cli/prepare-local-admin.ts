import { readEnvironment } from '../config/environment.ts'
import { createDatabase } from '../database/database-client.ts'
import { createAdminAccount } from '../modules/auth/index.ts'

if (process.env.NODE_ENV !== 'development' || process.env.LOCAL_COMPOSE_STARTUP !== 'true') {
  throw new Error('Automatic admin setup is only available through local development Compose.')
}

const database = createDatabase(readEnvironment(process.env))
try {
  // A restart or changed .env must never reset passwords, re-enable users or add admins.
  const existing = await database.client.user.findFirst({ where: { role: 'Admin' }, select: { id: true } })
  if (existing) console.info('Local admin already exists; existing accounts were preserved.')
  else {
    await createAdminAccount(database.client, {
      email: process.env.LOCAL_ADMIN_EMAIL,
      fullName: process.env.LOCAL_ADMIN_NAME,
      password: process.env.LOCAL_ADMIN_PASSWORD,
    })
    console.info('Local admin created using the root .env credentials.')
  }
} catch {
  console.error('Local admin setup failed. Check LOCAL_ADMIN_EMAIL, LOCAL_ADMIN_NAME and LOCAL_ADMIN_PASSWORD (15–128 characters). Existing accounts were not changed.')
  process.exitCode = 1
} finally { await database.close() }
