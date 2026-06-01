import fs from 'fs'
import path from 'path'
import { DeleteObjectCommand, S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { del, put } from '@vercel/blob'
import { newId } from '../utils.js'

export type UploadInput = {
  business_id: string
  kind: string
  content_type: string
  buffer: Buffer
}

export type UploadResult = {
  url: string
  key: string
  size_bytes: number
}

export interface FileStorageProvider {
  upload(input: UploadInput): Promise<UploadResult>
  delete(keyOrUrl: string): Promise<void>
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

class LocalUploadsProvider implements FileStorageProvider {
  private uploadDir: string
  constructor(uploadDir: string) {
    this.uploadDir = uploadDir
    ensureDir(this.uploadDir)
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const fileName = newId().replace(/-/g, '')
    const key = `${input.business_id}/${input.kind}/${fileName}`
    const diskName = fileName
    await fs.promises.writeFile(path.join(this.uploadDir, diskName), input.buffer)
    return { url: `/api/uploads/${diskName}`, key, size_bytes: input.buffer.byteLength }
  }

  async delete(keyOrUrl: string): Promise<void> {
    const raw = String(keyOrUrl || '')
    const diskName = raw.includes('/') ? raw.split('/').filter(Boolean).pop() || '' : raw
    if (!diskName) return
    try {
      await fs.promises.unlink(path.join(this.uploadDir, diskName))
    } catch (e: any) {
      if (e && e.code === 'ENOENT') return
      throw e
    }
  }
}

class S3Provider implements FileStorageProvider {
  private client: S3Client
  private bucket: string
  private publicBaseUrl: string

  constructor() {
    const bucket = process.env.S3_BUCKET || ''
    if (!bucket) throw new Error('Missing S3_BUCKET')
    this.bucket = bucket

    const endpoint = process.env.S3_ENDPOINT || undefined
    const region = process.env.S3_REGION || 'eu-west-3'
    const accessKeyId = process.env.S3_ACCESS_KEY_ID || ''
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || ''
    if (!accessKeyId || !secretAccessKey) throw new Error('Missing S3 credentials')

    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true'

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    })

    const base = process.env.S3_PUBLIC_BASE_URL
    if (base) {
      this.publicBaseUrl = base.replace(/\/$/, '')
    } else if (endpoint) {
      this.publicBaseUrl = `${String(endpoint).replace(/\/$/, '')}/${bucket}`
    } else {
      this.publicBaseUrl = `https://${bucket}.s3.${region}.amazonaws.com`
    }
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const key = `${input.business_id}/${input.kind}/${newId()}`
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.content_type,
      }),
    )
    return { url: `${this.publicBaseUrl}/${key}`, key, size_bytes: input.buffer.byteLength }
  }

  async delete(keyOrUrl: string): Promise<void> {
    const raw = String(keyOrUrl || '')
    let key = raw.includes('://') ? raw.split('/').slice(3).join('/') : raw.replace(/^\//, '')
    if (key.startsWith(`${this.bucket}/`)) key = key.slice(this.bucket.length + 1)
    if (!key) return
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    )
  }
}

class VercelBlobProvider implements FileStorageProvider {
  async upload(input: UploadInput): Promise<UploadResult> {
    const pathname = `${input.business_id}/${input.kind}/${newId()}`
    const blob = await put(pathname, input.buffer, { access: 'public', contentType: input.content_type, addRandomSuffix: true })
    return { url: blob.url, key: blob.pathname, size_bytes: input.buffer.byteLength }
  }

  async delete(keyOrUrl: string): Promise<void> {
    const raw = String(keyOrUrl || '')
    if (!raw) return
    await del(raw)
  }
}

let cached: FileStorageProvider | null = null

export function getFileStorageProvider(): FileStorageProvider {
  if (cached) return cached

  const kind =
    process.env.FILE_STORAGE ||
    (process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'local')

  if (kind === 's3') cached = new S3Provider()
  else if (kind === 'blob') cached = new VercelBlobProvider()
  else cached = new LocalUploadsProvider('/tmp/uploads')

  return cached
}
