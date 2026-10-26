import { setTimeout } from 'node:timers/promises'
import { readEnvironment } from '../config/environment.ts'
import { createDatabase } from '../database/database-client.ts'
import { createNotificationWorker } from '../modules/notifications/notification-worker.ts'
import { createCaptureTransport } from '../modules/notifications/capture-transport.ts'
try {
 const transport = createCaptureTransport(process.env)
 const database = createDatabase(readEnvironment(process.env))
 const worker = createNotificationWorker(database.client, transport)
 let stopping = false
 const controller = new AbortController()
 for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; controller.abort() })
 console.info(JSON.stringify({ event: 'notification_worker_started', transport: 'capture' }))
 try {
  while (!stopping) {
   try { if (await worker.runOnce()) continue }
   catch { console.error(JSON.stringify({ event: 'notification_worker_failed' })) }
   await setTimeout(2000, undefined, { signal: controller.signal }).catch(() => undefined)
  }
 } finally { await database.close() }
} catch { console.error('Notification worker startup failed. Check development capture and database configuration.'); process.exitCode = 1 }
