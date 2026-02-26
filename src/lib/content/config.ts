import os from 'node:os'
import path from 'node:path'

const DEFAULT_INDEX_URL = 'https://stack.mcell.top/mcp/index.json'
const DEFAULT_CACHE_TTL_SECONDS = 60 * 30
const DEFAULT_REQUEST_TIMEOUT_SECONDS = 20

export interface ContentConfig {
  indexUrl: string
  cacheDir: string
  cacheTtlMs: number
  requestTimeoutMs: number
}

function parsePositiveInt(raw: string | undefined, fallback: number, envName: string): number {
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive integer`)
  }
  return parsed
}

export function loadContentConfig(env: NodeJS.ProcessEnv = process.env): ContentConfig {
  const indexUrl = (env.MCELL_CONTENT_INDEX_URL ?? DEFAULT_INDEX_URL).trim()
  if (!indexUrl) {
    throw new Error('MCELL_CONTENT_INDEX_URL cannot be empty')
  }
  try {
    // Validate URL format early to provide deterministic startup errors.
    new URL(indexUrl)
  } catch {
    throw new Error('MCELL_CONTENT_INDEX_URL must be a valid URL')
  }

  const cacheDir = (env.MCELL_CONTENT_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'mcell-mcp', 'content')).trim()
  if (!cacheDir) {
    throw new Error('MCELL_CONTENT_CACHE_DIR cannot be empty')
  }

  const cacheTtlSeconds = parsePositiveInt(
    env.MCELL_CONTENT_CACHE_TTL_SECONDS,
    DEFAULT_CACHE_TTL_SECONDS,
    'MCELL_CONTENT_CACHE_TTL_SECONDS'
  )

  const requestTimeoutSeconds = parsePositiveInt(
    env.MCELL_CONTENT_REQUEST_TIMEOUT_SECONDS,
    DEFAULT_REQUEST_TIMEOUT_SECONDS,
    'MCELL_CONTENT_REQUEST_TIMEOUT_SECONDS'
  )

  return {
    indexUrl,
    cacheDir,
    cacheTtlMs: cacheTtlSeconds * 1000,
    requestTimeoutMs: requestTimeoutSeconds * 1000
  }
}
