import path from 'node:path'
import sharp, { type Sharp } from 'sharp'
import * as z from 'zod/v4'
import { ensureOutputDirectory, ensureReadableFile, resolvePath } from './files.js'

export const ImageFormatSchema = z.enum(['jpeg', 'png', 'webp', 'avif', 'tiff', 'heif', 'gif'])

export const ResizeFitSchema = z.enum(['cover', 'contain', 'fill', 'inside', 'outside'])

export type ImageFormat = z.infer<typeof ImageFormatSchema>
export type ResizeFit = z.infer<typeof ResizeFitSchema>

export const EXT_TO_FORMAT: Record<string, ImageFormat> = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.webp': 'webp',
  '.avif': 'avif',
  '.tif': 'tiff',
  '.tiff': 'tiff',
  '.heif': 'heif',
  '.heic': 'heif',
  '.gif': 'gif'
}

export const FORMAT_TO_EXT: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  tiff: 'tiff',
  heif: 'heif',
  gif: 'gif'
}

export type ImageOperationResult = {
  ok: true
  input_path: string
  output_path: string
  output_format: ImageFormat
  quality: number
  bytes: number
  width?: number
  height?: number
}

export type CompressImageInput = {
  input_path: string
  output_path?: string
  quality?: number
  format?: ImageFormat
  width?: number
  height?: number
  fit?: ResizeFit
  cwd?: string
}

export type ConvertImageInput = {
  input_path: string
  output_format: ImageFormat
  output_path?: string
  quality?: number
  cwd?: string
}

export function inferFormatFromPath(filePath: string): ImageFormat | undefined {
  return EXT_TO_FORMAT[path.extname(filePath).toLowerCase()]
}

export function buildOutputPath(
  inputPath: string,
  outputPath: string | undefined,
  format: ImageFormat,
  suffix: string,
  cwd = process.cwd()
): string {
  if (outputPath) {
    return resolvePath(outputPath, cwd)
  }

  const parsed = path.parse(inputPath)
  const ext = FORMAT_TO_EXT[format]
  return path.join(parsed.dir, `${parsed.name}.${suffix}.${ext}`)
}

export function toQuality(value: number | undefined, fallback: number): number {
  const quality = value ?? fallback
  return Math.min(100, Math.max(1, Math.round(quality)))
}

export function applyFormat(image: Sharp, format: ImageFormat, quality: number): Sharp {
  switch (format) {
    case 'jpeg':
      return image.jpeg({ quality, mozjpeg: true })
    case 'png':
      return image.png({
        quality,
        compressionLevel: Math.min(9, Math.max(0, Math.round((100 - quality) / 10))),
        palette: quality < 95
      })
    case 'webp':
      return image.webp({ quality })
    case 'avif':
      return image.avif({ quality })
    case 'tiff':
      return image.tiff({ quality })
    case 'heif':
      return image.heif({ quality, compression: 'av1' })
    case 'gif':
      return image.gif()
  }
}

export async function compressImage(args: CompressImageInput): Promise<ImageOperationResult> {
  const cwd = args.cwd ?? process.cwd()
  const inputPath = resolvePath(args.input_path, cwd)
  await ensureReadableFile(inputPath)

  const inferredFromInput = inferFormatFromPath(inputPath)
  const inferredFromOutput = args.output_path ? inferFormatFromPath(resolvePath(args.output_path, cwd)) : undefined

  const targetFormat = args.format ?? inferredFromOutput ?? inferredFromInput ?? 'jpeg'
  const outputPath = buildOutputPath(inputPath, args.output_path, targetFormat, 'compressed', cwd)
  const quality = toQuality(args.quality, 80)

  await ensureOutputDirectory(outputPath)

  let image = sharp(inputPath, { failOnError: false })
  if (args.width || args.height) {
    image = image.resize({
      width: args.width,
      height: args.height,
      fit: args.fit ?? 'inside',
      withoutEnlargement: true
    })
  }

  const info = await applyFormat(image, targetFormat, quality).toFile(outputPath)

  return {
    ok: true,
    input_path: inputPath,
    output_path: outputPath,
    output_format: targetFormat,
    quality,
    bytes: info.size,
    width: info.width,
    height: info.height
  }
}

export async function convertImage(args: ConvertImageInput): Promise<ImageOperationResult> {
  const cwd = args.cwd ?? process.cwd()
  const inputPath = resolvePath(args.input_path, cwd)
  await ensureReadableFile(inputPath)

  const outputPath = buildOutputPath(inputPath, args.output_path, args.output_format, 'converted', cwd)
  const quality = toQuality(args.quality, 85)

  await ensureOutputDirectory(outputPath)

  const info = await applyFormat(sharp(inputPath, { failOnError: false }), args.output_format, quality).toFile(
    outputPath
  )

  return {
    ok: true,
    input_path: inputPath,
    output_path: outputPath,
    output_format: args.output_format,
    quality,
    bytes: info.size,
    width: info.width,
    height: info.height
  }
}
