import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FORMAT_TO_EXT, EXT_TO_FORMAT, buildOutputPath, inferFormatFromPath, toQuality } from '../src/lib/image.js'

describe('image format maps', () => {
  it('maps input extensions to formats', () => {
    expect(EXT_TO_FORMAT['.jpg']).toBe('jpeg')
    expect(EXT_TO_FORMAT['.png']).toBe('png')
    expect(EXT_TO_FORMAT['.webp']).toBe('webp')
  })

  it('maps formats to output extensions', () => {
    expect(FORMAT_TO_EXT.jpeg).toBe('jpg')
    expect(FORMAT_TO_EXT.avif).toBe('avif')
    expect(FORMAT_TO_EXT.tiff).toBe('tiff')
  })
})

describe('inferFormatFromPath', () => {
  it('infers known format from lowercase extension', () => {
    expect(inferFormatFromPath('/tmp/demo.jpg')).toBe('jpeg')
  })

  it('infers known format from uppercase extension', () => {
    expect(inferFormatFromPath('/tmp/demo.PNG')).toBe('png')
  })

  it('returns undefined for unknown extension', () => {
    expect(inferFormatFromPath('/tmp/demo.xyz')).toBeUndefined()
  })
})

describe('buildOutputPath', () => {
  it('builds a default path with suffix and target extension', () => {
    const output = buildOutputPath('/tmp/image/source.png', undefined, 'webp', 'compressed')
    expect(output).toBe('/tmp/image/source.compressed.webp')
  })

  it('resolves a relative explicit output path using cwd', () => {
    const output = buildOutputPath('/tmp/image/source.png', './out/custom.jpg', 'jpeg', 'compressed', '/work/project')
    expect(output).toBe(path.resolve('/work/project', './out/custom.jpg'))
  })
})

describe('toQuality', () => {
  it('uses fallback when value is undefined', () => {
    expect(toQuality(undefined, 80)).toBe(80)
  })

  it('clamps values lower than 1', () => {
    expect(toQuality(0, 80)).toBe(1)
  })

  it('clamps values higher than 100', () => {
    expect(toQuality(120, 80)).toBe(100)
  })

  it('rounds float values', () => {
    expect(toQuality(42.6, 80)).toBe(43)
  })
})
