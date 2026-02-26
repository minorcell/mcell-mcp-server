import { access } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compressImage, convertImage } from '../src/lib/image.js'
import { createSamplePng, createTempDir, removeTempDir } from './test-helpers.js'

describe('image operations', () => {
  let tempDir = ''
  let sourcePng = ''

  beforeEach(async () => {
    tempDir = await createTempDir('mcell-image-')
    sourcePng = path.join(tempDir, 'source.png')
    await createSamplePng(sourcePng, 1200, 900)
  })

  afterEach(async () => {
    await removeTempDir(tempDir)
  })

  it('compresses image and infers png output by default', async () => {
    const result = await compressImage({
      input_path: 'source.png',
      quality: 70,
      cwd: tempDir
    })

    expect(result.ok).toBe(true)
    expect(result.output_format).toBe('png')
    expect(result.output_path).toBe(path.join(tempDir, 'source.compressed.png'))
    await expect(access(result.output_path)).resolves.toBeUndefined()
  })

  it('compresses with resize and explicit output format', async () => {
    const result = await compressImage({
      input_path: sourcePng,
      format: 'webp',
      width: 300,
      quality: 60
    })

    const meta = await sharp(result.output_path).metadata()
    expect(result.output_format).toBe('webp')
    expect(meta.width).toBeLessThanOrEqual(300)
    expect(meta.height).toBeLessThanOrEqual(300)
  })

  it('compresses to explicit output path', async () => {
    const explicitOut = path.join(tempDir, 'nested', 'compressed.jpg')
    const result = await compressImage({
      input_path: sourcePng,
      output_path: explicitOut,
      format: 'jpeg',
      quality: 75
    })

    expect(result.output_path).toBe(explicitOut)
    await expect(access(explicitOut)).resolves.toBeUndefined()
  })

  it('converts image to target format with default output path', async () => {
    const result = await convertImage({
      input_path: sourcePng,
      output_format: 'avif',
      quality: 65
    })

    const meta = await sharp(result.output_path).metadata()
    expect(result.output_path.endsWith('.converted.avif')).toBe(true)
    expect(result.output_format).toBe('avif')
    expect(['heif', 'avif']).toContain(meta.format)
  })

  it('converts image to explicit output path', async () => {
    const explicitOut = path.join(tempDir, 'out', 'converted.webp')
    const result = await convertImage({
      input_path: sourcePng,
      output_format: 'webp',
      output_path: explicitOut
    })

    expect(result.output_path).toBe(explicitOut)
    await expect(access(explicitOut)).resolves.toBeUndefined()
  })

  it('throws when compressing a missing file', async () => {
    await expect(
      compressImage({
        input_path: path.join(tempDir, 'missing.png')
      })
    ).rejects.toThrow()
  })

  it('throws when converting a missing file', async () => {
    await expect(
      convertImage({
        input_path: path.join(tempDir, 'missing.png'),
        output_format: 'jpeg'
      })
    ).rejects.toThrow()
  })
})
