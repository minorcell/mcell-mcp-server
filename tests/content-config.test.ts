import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadContentConfig } from '../src/lib/content/config.js'

describe('content config', () => {
  it('uses defaults when env is not set', () => {
    const config = loadContentConfig({})

    expect(config.indexUrl).toBe('https://stack.mcell.top/mcp/index.json')
    expect(config.cacheDir).toBe(path.join(os.homedir(), '.cache', 'mcell-mcp', 'content'))
    expect(config.cacheTtlMs).toBe(1800 * 1000)
    expect(config.requestTimeoutMs).toBe(20 * 1000)
  })

  it('reads explicit env values', () => {
    const config = loadContentConfig({
      MCELL_CONTENT_INDEX_URL: 'https://example.com/mcp/index.json',
      MCELL_CONTENT_CACHE_DIR: '/tmp/mcell-content-cache',
      MCELL_CONTENT_CACHE_TTL_SECONDS: '300',
      MCELL_CONTENT_REQUEST_TIMEOUT_SECONDS: '40'
    })

    expect(config.indexUrl).toBe('https://example.com/mcp/index.json')
    expect(config.cacheDir).toBe('/tmp/mcell-content-cache')
    expect(config.cacheTtlMs).toBe(300 * 1000)
    expect(config.requestTimeoutMs).toBe(40 * 1000)
  })

  it('throws for invalid ttl', () => {
    expect(() => loadContentConfig({ MCELL_CONTENT_CACHE_TTL_SECONDS: '0' })).toThrow('MCELL_CONTENT_CACHE_TTL_SECONDS')
  })

  it('throws for invalid request timeout', () => {
    expect(() => loadContentConfig({ MCELL_CONTENT_REQUEST_TIMEOUT_SECONDS: '-1' })).toThrow(
      'MCELL_CONTENT_REQUEST_TIMEOUT_SECONDS'
    )
  })

  it('throws for invalid index url', () => {
    expect(() => loadContentConfig({ MCELL_CONTENT_INDEX_URL: 'not-a-url' })).toThrow('MCELL_CONTENT_INDEX_URL')
  })
})
