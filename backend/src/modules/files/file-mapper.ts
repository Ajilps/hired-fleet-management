import type { FileAsset } from '../../generated/prisma/client.ts'

export function fileAssetDto(asset: FileAsset) {
  return {
    id: asset.id,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    sizeBytes: Number(asset.byteSize),
    checksumSha256: asset.checksumSha256,
    scanStatus: asset.malwareScanStatus,
    uploadedByUserId: asset.uploadedByUserId,
    createdAt: asset.createdAt.toISOString(),
  }
}
