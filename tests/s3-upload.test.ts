import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadToS3 } from '../src/lib/s3.js'
import { createTempDir, removeTempDir } from './test-helpers.js'

describe('uploadToS3', () => {
  let tempDir = ''
  let filePath = ''
  let originalAwsRegion: string | undefined

  beforeEach(async () => {
    tempDir = await createTempDir('mcell-s3-')
    filePath = path.join(tempDir, 'demo.txt')
    await writeFile(filePath, 'hello mcp\n', 'utf8')
    originalAwsRegion = process.env.AWS_REGION
    delete process.env.AWS_REGION
  })

  afterEach(async () => {
    if (originalAwsRegion === undefined) {
      delete process.env.AWS_REGION
    } else {
      process.env.AWS_REGION = originalAwsRegion
    }
    await removeTempDir(tempDir)
    vi.restoreAllMocks()
  })

  it('uploads with default region and inferred content type', async () => {
    const clientConfig: unknown[] = []
    const commands: PutObjectCommand[] = []
    const fakeClient = {
      send: vi.fn(async (command: PutObjectCommand) => {
        commands.push(command)
        return { ETag: '"etag-1"', VersionId: 'v1' }
      })
    }

    const result = await uploadToS3(
      {
        file_path: filePath,
        bucket: 'my-bucket',
        key: 'docs/demo.txt'
      },
      {
        createS3Client: (config) => {
          clientConfig.push(config)
          return fakeClient
        }
      }
    )

    expect(result.region).toBe('us-east-1')
    expect(result.location).toBe('s3://my-bucket/docs/demo.txt')
    expect(clientConfig[0]).toMatchObject({ region: 'us-east-1' })
    expect(commands).toHaveLength(1)
    expect(commands[0].input.Bucket).toBe('my-bucket')
    expect(commands[0].input.Key).toBe('docs/demo.txt')
    expect(commands[0].input.ContentType).toBe('text/plain')
  })

  it('uses AWS_REGION from environment when region is omitted', async () => {
    process.env.AWS_REGION = 'ap-southeast-1'
    const createS3Client = vi.fn(() => ({
      send: vi.fn(async () => ({}))
    }))

    const result = await uploadToS3(
      {
        file_path: filePath,
        bucket: 'my-bucket',
        key: 'demo.txt'
      },
      { createS3Client }
    )

    expect(result.region).toBe('ap-southeast-1')
    expect(createS3Client).toHaveBeenCalledWith(expect.objectContaining({ region: 'ap-southeast-1' }))
  })

  it('lets explicit region override AWS_REGION', async () => {
    process.env.AWS_REGION = 'ap-southeast-1'
    const createS3Client = vi.fn(() => ({
      send: vi.fn(async () => ({}))
    }))

    const result = await uploadToS3(
      {
        file_path: filePath,
        bucket: 'my-bucket',
        key: 'demo.txt',
        region: 'us-west-2'
      },
      { createS3Client }
    )

    expect(result.region).toBe('us-west-2')
    expect(createS3Client).toHaveBeenCalledWith(expect.objectContaining({ region: 'us-west-2' }))
  })

  it('passes endpoint and force path style to S3 client config', async () => {
    const createS3Client = vi.fn(() => ({
      send: vi.fn(async () => ({}))
    }))

    await uploadToS3(
      {
        file_path: filePath,
        bucket: 'my-bucket',
        key: 'demo.txt',
        endpoint: 'https://example-s3.internal',
        force_path_style: true
      },
      { createS3Client }
    )

    expect(createS3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://example-s3.internal',
        forcePathStyle: true
      })
    )
  })

  it('prefers explicit content_type over inferred mime type', async () => {
    const commands: PutObjectCommand[] = []
    const fakeClient = {
      send: vi.fn(async (command: PutObjectCommand) => {
        commands.push(command)
        return {}
      })
    }

    await uploadToS3(
      {
        file_path: filePath,
        bucket: 'my-bucket',
        key: 'demo.txt',
        content_type: 'application/custom'
      },
      {
        createS3Client: () => fakeClient
      }
    )

    expect(commands[0].input.ContentType).toBe('application/custom')
  })

  it('throws when source file does not exist', async () => {
    await expect(
      uploadToS3({
        file_path: path.join(tempDir, 'missing.txt'),
        bucket: 'my-bucket',
        key: 'missing.txt'
      })
    ).rejects.toThrow()
  })
})
