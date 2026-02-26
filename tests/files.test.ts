import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureOutputDirectory, ensureReadableFile, resolvePath } from '../src/lib/files.js'
import { createTempDir, removeTempDir } from './test-helpers.js'

describe('file helpers', () => {
  let tempDir = ''

  beforeEach(async () => {
    tempDir = await createTempDir('mcell-files-')
  })

  afterEach(async () => {
    await removeTempDir(tempDir)
  })

  it('resolves paths relative to cwd', () => {
    const absolute = resolvePath('./data/input.png', '/workspace/proj')
    expect(absolute).toBe(path.resolve('/workspace/proj', './data/input.png'))
  })

  it('passes on existing regular files', async () => {
    const filePath = path.join(tempDir, 'exists.txt')
    await writeFile(filePath, 'hello', 'utf8')
    await expect(ensureReadableFile(filePath)).resolves.toBeUndefined()
  })

  it('throws for non-file paths', async () => {
    const dirPath = path.join(tempDir, 'folder')
    await mkdir(dirPath)
    await expect(ensureReadableFile(dirPath)).rejects.toThrow('Not a file')
  })

  it('creates nested output directories', async () => {
    const outFile = path.join(tempDir, 'a', 'b', 'c', 'out.jpg')
    await expect(ensureOutputDirectory(outFile)).resolves.toBeUndefined()
  })
})
