import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

export async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix))
}

export async function removeTempDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true })
}

export async function createSamplePng(filePath: string, width = 640, height = 480): Promise<void> {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 220, g: 120, b: 80 }
    }
  })
    .png()
    .toFile(filePath)
}

export function parseToolTextContent(result: { content: Array<{ type: string; text?: string }> }): unknown {
  const first = result.content[0]
  if (!first || first.type !== 'text' || !first.text) {
    throw new Error('Tool result does not contain text content.')
  }
  return JSON.parse(first.text)
}
