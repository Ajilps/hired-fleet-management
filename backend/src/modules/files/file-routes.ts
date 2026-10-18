import { Router } from 'express'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { AuthConfig } from '../auth/index.ts'
import { createFileService } from './file-service.ts'
import { createUploadService } from './upload-service.ts'
import type { UploadDependencies } from './upload-service.ts'
import { createUploadController } from './upload-controller.ts'
import { createFileController } from './file-controller.ts'

export function createFileRouter(client: PrismaClient, auth: AuthConfig, uploads?: { fingerprintKey: Uint8Array; origins: string[]; dependencies: UploadDependencies; attemptsPerMinute?: number }) {
  const fileRouter = Router()
  const controller = createFileController(createFileService(client, auth))
  fileRouter.get('/file-assets/:assetId', controller.get)
  if (uploads) fileRouter.post('/file-assets', createUploadController(createUploadService(client, auth, uploads.fingerprintKey, uploads.origins, uploads.dependencies, uploads.attemptsPerMinute)))
  return fileRouter
}
