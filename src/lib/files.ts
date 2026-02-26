import { promises as fs } from 'node:fs'
import path from 'node:path'

export function resolvePath(inputPath: string, cwd = process.cwd()): string {
  return path.resolve(cwd, inputPath)
}

export async function ensureReadableFile(filePath: string): Promise<void> {
  const stats = await fs.stat(filePath)
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${filePath}`)
  }
}

export async function ensureOutputDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}
