import { Router } from 'express'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { AuthConfig } from '../auth/index.ts'
import { createFileService } from './file-service.ts'
import type { FileAccessConfig } from './file-service.ts'
import { createUploadService } from './upload-service.ts'
import type { UploadDependencies } from './upload-service.ts'
import { createUploadController } from './upload-controller.ts'
import { createFileController } from './file-controller.ts'

export function createFileRouter(client: PrismaClient, auth: AuthConfig, uploads?: { fingerprintKey: Uint8Array; origins: string[]; dependencies: UploadDependencies; attemptsPerMinute?: number }, access?: FileAccessConfig) {
  const fileRouter = Router()
  const controller = createFileController(createFileService(client, auth, access))
  fileRouter.get('/file-assets/:assetId', controller.get)
  fileRouter.post('/file-assets/:assetId/download-links', controller.download)
  if (uploads) fileRouter.post('/file-assets', createUploadController(createUploadService(client, auth, uploads.fingerprintKey, uploads.origins, uploads.dependencies, uploads.attemptsPerMinute)))
  return fileRouter
}
