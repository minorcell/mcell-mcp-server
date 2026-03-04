import fs from 'node:fs'
import path from 'node:path'
import type { ContentConfig } from './config.js'
import type { BlogDocument, BlogEntry, DatasetDocument, DatasetEntry, DatasetIndex } from './types.js'

interface CacheReadResult {
  payload: unknown
  stale: boolean
}

interface MemoryCache<T> {
  value: T
  expiresAt: number
}

interface ContentDatasetClientDeps {
  fetchFn?: typeof fetch
  now?: () => number
}

export interface ContentBlogClient {
  listLatestBlogs(count: number): Promise<BlogEntry[]>
  listBlogs(count: number, offset: number): Promise<{ entries: BlogEntry[]; total: number }>
  searchBlogs(query: string, count: number): Promise<BlogEntry[]>
  getBlogDocumentById(id: string): Promise<BlogDocument>
  getBlogDocumentBySlug(slug: string): Promise<BlogDocument>
  refreshIndex(): Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRequiredString(raw: Record<string, unknown>, key: string): string {
  const value = raw[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid field "${key}"`)
  }
  return value
}

function readOptionalString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new Error(`Invalid field "${key}"`)
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

function readOptionalNumber(raw: Record<string, unknown>, key: string): number | undefined {
  const value = raw[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid field "${key}"`)
  }
  return value
}

function parseDatasetEntry(raw: unknown): DatasetEntry {
  if (!isRecord(raw)) {
    throw new Error('Invalid dataset entry')
  }

  return {
    id: readRequiredString(raw, 'id'),
    type: readRequiredString(raw, 'type'),
    slug: readRequiredString(raw, 'slug'),
    title: readRequiredString(raw, 'title'),
    description: readOptionalString(raw, 'description'),
    date: readOptionalString(raw, 'date'),
    order: readOptionalNumber(raw, 'order'),
    url: readRequiredString(raw, 'url'),
    document: readRequiredString(raw, 'document'),
    extra: isRecord(raw.extra) ? raw.extra : undefined
  }
}

function parseDatasetIndex(raw: unknown): DatasetIndex {
  if (!isRecord(raw)) {
    throw new Error('Invalid dataset index payload')
  }
  if (!Array.isArray(raw.entries)) {
    throw new Error('Invalid dataset index entries')
  }

  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    generatedAt: readRequiredString(raw, 'generatedAt'),
    total: typeof raw.total === 'number' ? raw.total : undefined,
    entries: raw.entries.map((entry) => parseDatasetEntry(entry))
  }
}

function parseDatasetDocument(raw: unknown): DatasetDocument {
  if (!isRecord(raw)) {
    throw new Error('Invalid dataset document payload')
  }
  const entry = parseDatasetEntry(raw)

  const sourcePath = readRequiredString(raw, 'sourcePath')
  const contentRaw = raw.content
  if (typeof contentRaw !== 'string') {
    throw new Error('Invalid field "content"')
  }

  return {
    ...entry,
    sourcePath,
    content: contentRaw,
    metadata: isRecord(raw.metadata) ? raw.metadata : {}
  }
}

function parseDateTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return undefined
  return timestamp
}

function compareEntries(a: DatasetEntry, b: DatasetEntry): number {
  const dateA = parseDateTimestamp(a.date)
  const dateB = parseDateTimestamp(b.date)
  if (dateA !== undefined && dateB !== undefined) {
    return dateB - dateA
  }
  if (dateA !== undefined) return -1
  if (dateB !== undefined) return 1

  if (typeof a.order === 'number' && typeof b.order === 'number') {
    return a.order - b.order
  }
  if (typeof a.order === 'number') return -1
  if (typeof b.order === 'number') return 1

  return a.title.localeCompare(b.title)
}

function toSafeCacheFileName(value: string): string {
  return `${value.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`
}

function toBlogEntry(entry: DatasetEntry): BlogEntry {
  return {
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    description: entry.description,
    date: entry.date,
    url: entry.url,
    document: entry.document
  }
}

function toBlogDocument(document: DatasetDocument): BlogDocument {
  return {
    id: document.id,
    slug: document.slug,
    title: document.title,
    description: document.description,
    date: document.date,
    url: document.url,
    sourcePath: document.sourcePath,
    metadata: document.metadata,
    content: document.content
  }
}

export class ContentDatasetClient implements ContentBlogClient {
  private readonly indexCachePath: string
  private readonly documentsCacheDir: string
  private readonly fetchFn: typeof fetch
  private readonly now: () => number
  private indexMemoryCache?: MemoryCache<DatasetIndex>
  private documentMemoryCache = new Map<string, MemoryCache<DatasetDocument>>()

  constructor(
    private readonly config: ContentConfig,
    deps: ContentDatasetClientDeps = {}
  ) {
    this.fetchFn = deps.fetchFn ?? fetch
    this.now = deps.now ?? (() => Date.now())
    this.indexCachePath = path.join(this.config.cacheDir, 'index.json')
    this.documentsCacheDir = path.join(this.config.cacheDir, 'documents')
    fs.mkdirSync(this.documentsCacheDir, { recursive: true })
  }

  async listLatestBlogs(count: number): Promise<BlogEntry[]> {
    const blogEntries = await this.getBlogEntries()
    return [...blogEntries]
      .sort(compareEntries)
      .slice(0, count)
      .map((entry) => toBlogEntry(entry))
  }

  async listBlogs(count: number, offset: number): Promise<{ entries: BlogEntry[]; total: number }> {
    const blogEntries = await this.getBlogEntries()
    const sorted = [...blogEntries].sort(compareEntries)
    return {
      entries: sorted.slice(offset, offset + count).map((entry) => toBlogEntry(entry)),
      total: sorted.length
    }
  }

  async searchBlogs(query: string, count: number): Promise<BlogEntry[]> {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return []

    const blogEntries = await this.getBlogEntries()
    const scored = blogEntries
      .map((entry) => {
        const title = entry.title.toLowerCase()
        const slug = entry.slug.toLowerCase()
        const description = (entry.description ?? '').toLowerCase()

        let score = 0
        if (title.includes(normalizedQuery)) score += 3
        if (slug.includes(normalizedQuery)) score += 2
        if (description.includes(normalizedQuery)) score += 1

        return { entry, score }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score
        return compareEntries(a.entry, b.entry)
      })
      .slice(0, count)
      .map((item) => toBlogEntry(item.entry))

    return scored
  }

  async getBlogDocumentById(id: string): Promise<BlogDocument> {
    const index = await this.getIndex()
    const entry = index.entries.find((item) => item.id === id && item.type === 'blog')
    if (!entry) {
      throw new Error(`Blog not found by id: ${id}`)
    }
    const document = await this.getDocumentByEntry(entry)
    if (document.type !== 'blog') {
      throw new Error(`Resource is not a blog: ${id}`)
    }
    return toBlogDocument(document)
  }

  async getBlogDocumentBySlug(slug: string): Promise<BlogDocument> {
    const index = await this.getIndex()
    const entry = index.entries.find((item) => item.slug === slug && item.type === 'blog')
    if (!entry) {
      throw new Error(`Blog not found by slug: ${slug}`)
    }
    const document = await this.getDocumentByEntry(entry)
    if (document.type !== 'blog') {
      throw new Error(`Resource is not a blog: ${slug}`)
    }
    return toBlogDocument(document)
  }

  async refreshIndex(): Promise<void> {
    await this.getIndex(true)
  }

  private async getBlogEntries(): Promise<DatasetEntry[]> {
    const index = await this.getIndex()
    return index.entries.filter((entry) => entry.type === 'blog')
  }

  private isMemoryCacheValid<T>(cache: MemoryCache<T> | undefined): cache is MemoryCache<T> {
    return !!cache && cache.expiresAt > this.now()
  }

  private readCache(filePath: string): CacheReadResult | undefined {
    if (!fs.existsSync(filePath)) return undefined
    try {
      const stat = fs.statSync(filePath)
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
      return {
        payload,
        stale: this.now() - stat.mtimeMs > this.config.cacheTtlMs
      }
    } catch {
      return undefined
    }
  }

  private writeCache(filePath: string, payload: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`)
  }

  private async fetchJson(url: string): Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs)
    try {
      const response = await this.fetchFn(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': '@mcell/mcell-mcp-server'
        }
      })
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`)
      }
      return (await response.json()) as unknown
    } finally {
      clearTimeout(timeout)
    }
  }

  private async getIndex(forceRefresh = false): Promise<DatasetIndex> {
    if (!forceRefresh && this.isMemoryCacheValid(this.indexMemoryCache)) {
      return this.indexMemoryCache.value
    }

    const diskCache = this.readCache(this.indexCachePath)
    if (!forceRefresh && diskCache && !diskCache.stale) {
      const parsed = parseDatasetIndex(diskCache.payload)
      this.indexMemoryCache = {
        value: parsed,
        expiresAt: this.now() + this.config.cacheTtlMs
      }
      return parsed
    }

    try {
      const payload = await this.fetchJson(this.config.indexUrl)
      const parsed = parseDatasetIndex(payload)
      this.writeCache(this.indexCachePath, payload)
      this.indexMemoryCache = {
        value: parsed,
        expiresAt: this.now() + this.config.cacheTtlMs
      }
      return parsed
    } catch (error) {
      if (diskCache) {
        const parsed = parseDatasetIndex(diskCache.payload)
        this.indexMemoryCache = {
          value: parsed,
          expiresAt: this.now() + Math.min(this.config.cacheTtlMs, 5 * 60 * 1000)
        }
        return parsed
      }
      throw error
    }
  }

  private async getDocumentByEntry(entry: DatasetEntry): Promise<DatasetDocument> {
    const memory = this.documentMemoryCache.get(entry.id)
    if (this.isMemoryCacheValid(memory)) {
      return memory.value
    }

    const cachePath = path.join(this.documentsCacheDir, toSafeCacheFileName(entry.id))
    const diskCache = this.readCache(cachePath)
    if (diskCache && !diskCache.stale) {
      const parsed = parseDatasetDocument(diskCache.payload)
      this.documentMemoryCache.set(entry.id, {
        value: parsed,
        expiresAt: this.now() + this.config.cacheTtlMs
      })
      return parsed
    }

    const documentUrl = new URL(entry.document, this.config.indexUrl).toString()
    try {
      const payload = await this.fetchJson(documentUrl)
      const parsed = parseDatasetDocument(payload)
      this.writeCache(cachePath, payload)
      this.documentMemoryCache.set(entry.id, {
        value: parsed,
        expiresAt: this.now() + this.config.cacheTtlMs
      })
      return parsed
    } catch (error) {
      if (diskCache) {
        const parsed = parseDatasetDocument(diskCache.payload)
        this.documentMemoryCache.set(entry.id, {
          value: parsed,
          expiresAt: this.now() + Math.min(this.config.cacheTtlMs, 5 * 60 * 1000)
        })
        return parsed
      }
      throw error
    }
  }
}
