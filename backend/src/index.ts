import { Router } from 'express'
import { createApp } from './app.ts'
import { readEnvironment } from './config/environment.ts'
import { createDatabase } from './database/database-client.ts'
import { createAuthRouter, readAuthConfig } from './modules/auth/index.ts'
import { createAccountRouter } from './modules/accounts/index.ts'
import { createCompanyRouter } from './modules/companies/index.ts'
import { createFileRouter, createPrivateObjectStore, readStorageConfig, createClamAvScanner, readScannerConfig, readUploadConfig } from './modules/files/index.ts'
import { createDriverRouter } from './modules/drivers/index.ts'
import { createDocumentRouter, readDocumentCipher } from './modules/documents/index.ts'
import { readCommandConfig } from './modules/commands/index.ts'

try {
  const config = readEnvironment(process.env)
  const authConfig = readAuthConfig(process.env)
  const commandConfig = readCommandConfig(process.env)
  const uploadsConfig = readUploadConfig(process.env)
  const documentCipher = readDocumentCipher(process.env)
  const privateStore = uploadsConfig.isEnabled ? createPrivateObjectStore(readStorageConfig(process.env)) : undefined
  const scanner = privateStore ? createClamAvScanner(readScannerConfig(process.env)) : undefined
  const database = createDatabase(config)
  let isShuttingDown = false
  const apiRouter = Router()
  apiRouter.use(await createAuthRouter(database.client, authConfig, config.corsOrigins))
  apiRouter.use(createAccountRouter(database.client, authConfig, commandConfig.fingerprintKey))
  apiRouter.use(createCompanyRouter(database.client, authConfig, commandConfig.fingerprintKey))
  apiRouter.use(createDriverRouter(database.client, authConfig, commandConfig.fingerprintKey, config.corsOrigins))
  apiRouter.use(createDocumentRouter(database.client, authConfig, commandConfig.fingerprintKey, config.corsOrigins, documentCipher))
  apiRouter.use(createFileRouter(database.client, authConfig, privateStore && scanner ? { fingerprintKey: commandConfig.fingerprintKey, origins: config.corsOrigins, attemptsPerMinute: uploadsConfig.attemptsPerMinute, dependencies: { store: privateStore, scanner } } : undefined, { fingerprintKey: commandConfig.fingerprintKey, origins: config.corsOrigins, signer: privateStore }))
  const app = createApp(config, database, () => isShuttingDown, apiRouter)
  const server = app.listen(config.port, config.host, () => {
    console.info(JSON.stringify({ event: 'api_started', host: config.host, port: config.port }))
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  server.on('error', () => {
    console.error('API listener failed. Check HOST and PORT.')
    void database.close().finally(() => { privateStore?.close(); process.exitCode = 1 })
  })

  async function shutdown() {
    if (isShuttingDown) return
    isShuttingDown = true
    const deadline = setTimeout(() => { process.exit(1) }, 10_000)
    deadline.unref()
    server.close(async () => {
      try { await database.close() }
      catch { process.exitCode = 1 }
      finally { privateStore?.close(); clearTimeout(deadline) }
    })
  }
  process.on('SIGTERM', () => { void shutdown() })
  process.on('SIGINT', () => { void shutdown() })
} catch (error) {
  // Configuration messages contain field names only, never supplied values.
  console.error(error instanceof Error && (error.message.startsWith('Invalid backend configuration:') || error.message.startsWith('Invalid authentication configuration.') || error.message.startsWith('Invalid command configuration.'))
    ? error.message : 'Backend startup failed.')
  process.exitCode = 1
}
