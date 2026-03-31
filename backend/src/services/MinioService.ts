import * as Minio from 'minio'
import { env } from '../config/env'
import { AppError } from '../utils/AppError'

// ── Client singleton ──────────────────────────────────────
export const minioClient = new Minio.Client({
  endPoint:  env.MINIO_ENDPOINT,
  port:      env.MINIO_PORT,
  useSSL:    env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
})

const BUCKET = env.MINIO_BUCKET
const PRESIGNED_EXPIRY = 60 * 60 * 2 // 2 hours

// ── Bootstrap: ensure bucket exists ──────────────────────
export async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET)
  if (!exists) {
    await minioClient.makeBucket(BUCKET, 'us-east-1')
    // Public read policy for files
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${BUCKET}/public/*`],
      }],
    })
    await minioClient.setBucketPolicy(BUCKET, policy)
    console.log(`✅ MinIO bucket "${BUCKET}" created`)
  }
}

// ── Upload a buffer ───────────────────────────────────────
export async function uploadFile(params: {
  buffer: Buffer
  storagePath: string
  mimeType: string
  size: number
}): Promise<string> {
  await minioClient.putObject(
    BUCKET,
    params.storagePath,
    params.buffer,
    params.size,
    { 'Content-Type': params.mimeType },
  )
  return params.storagePath
}

// ── Generate presigned download URL ──────────────────────
export async function getPresignedUrl(storagePath: string): Promise<string> {
  try {
    return await minioClient.presignedGetObject(BUCKET, storagePath, PRESIGNED_EXPIRY)
  } catch {
    throw new AppError('Could not generate file URL', 500)
  }
}

// ── Delete a file ─────────────────────────────────────────
export async function deleteFile(storagePath: string): Promise<void> {
  try {
    await minioClient.removeObject(BUCKET, storagePath)
  } catch {
    // Silently ignore if file doesn't exist
  }
}

// ── Upload avatar ─────────────────────────────────────────
export async function uploadAvatar(userId: string, buffer: Buffer, mimeType: string): Promise<string> {
  const ext = mimeType.split('/')[1] ?? 'jpg'
  const storagePath = `avatars/${userId}/avatar.${ext}`
  await uploadFile({ buffer, storagePath, mimeType, size: buffer.length })
  // Avatars served via presigned URL
  return storagePath
}

// ── List files in a prefix ────────────────────────────────
export async function listFiles(prefix: string): Promise<string[]> {
  const keys: string[] = []
  const stream = minioClient.listObjects(BUCKET, prefix, true)
  return new Promise((resolve, reject) => {
    stream.on('data', (obj) => { if (obj.name) keys.push(obj.name) })
    stream.on('end', () => resolve(keys))
    stream.on('error', reject)
  })
}

