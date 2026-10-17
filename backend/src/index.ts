import { createApp } from './app.ts'
import { readEnvironment } from './config/environment.ts'
import { createDatabase } from './database/database-client.ts'

try {
  const config = readEnvironment(process.env)
  const database = createDatabase(config)
  let isShuttingDown = false
  const app = createApp(config, database, () => isShuttingDown)
  const server = app.listen(config.port, config.host, () => {
    console.info(JSON.stringify({ event: 'api_started', host: config.host, port: config.port }))
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  server.on('error', () => {
    console.error('API listener failed. Check HOST and PORT.')
    void database.close().finally(() => { process.exitCode = 1 })
  })

  async function shutdown() {
    if (isShuttingDown) return
    isShuttingDown = true
    const deadline = setTimeout(() => { process.exit(1) }, 10_000)
    deadline.unref()
    server.close(async () => {
      try { await database.close() }
      catch { process.exitCode = 1 }
      finally { clearTimeout(deadline) }
    })
  }
  process.on('SIGTERM', () => { void shutdown() })
  process.on('SIGINT', () => { void shutdown() })
} catch (error) {
  // Configuration messages contain field names only, never supplied values.
  console.error(error instanceof Error && error.message.startsWith('Invalid backend configuration:')
    ? error.message : 'Backend startup failed.')
  process.exitCode = 1
}
