import { access, mkdir, readFile, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentConfig } from '../src/lib/content/config.js'
import { ContentDatasetClient } from '../src/lib/content/client.js'
import { createTempDir, removeTempDir } from './test-helpers.js'

function makeJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}

describe('content dataset client', () => {
  let tempDir = ''

  beforeEach(async () => {
    tempDir = await createTempDir('mcell-content-client-')
  })

  afterEach(async () => {
    await removeTempDir(tempDir)
    vi.restoreAllMocks()
  })

  function createConfig(overrides: Partial<ContentConfig> = {}): ContentConfig {
    return {
      indexUrl: 'https://example.com/mcp/index.json',
      cacheDir: path.join(tempDir, 'cache'),
      cacheTtlMs: 1000,
      requestTimeoutMs: 1000,
      ...overrides
    }
  }

  it('writes cache on remote success and returns latest blogs', async () => {
    const indexPayload = {
      version: 2,
      generatedAt: '2026-01-01T00:00:00.000Z',
      entries: [
        {
          id: 'blog:2026/old',
          type: 'blog',
          slug: '2026/old',
          title: 'Old Post',
          date: '2026-01-01T00:00:00.000Z',
          url: '/blog/2026/old',
          document: 'articles/blog_2026_old.json'
        },
        {
          id: 'blog:2026/new',
          type: 'blog',
          slug: '2026/new',
          title: 'New Post',
          date: '2026-02-01T00:00:00.000Z',
          url: '/blog/2026/new',
          document: 'articles/blog_2026_new.json'
        },
        {
          id: 'topic:react-hooks',
          type: 'topic',
          slug: 'react-hooks',
          title: 'React Hooks',
          url: '/topics/react-hooks',
          document: 'articles/topic_react-hooks.json'
        }
      ]
    }

    const fetchFn = vi.fn(async () => makeJsonResponse(indexPayload)) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    const entries = await client.listLatestBlogs(2)

    expect(entries.map((entry) => entry.id)).toEqual(['blog:2026/new', 'blog:2026/old'])
    await expect(access(path.join(tempDir, 'cache', 'index.json'))).resolves.toBeUndefined()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('falls back to stale cache when remote fetch fails', async () => {
    const cacheDir = path.join(tempDir, 'cache')
    const cachePath = path.join(cacheDir, 'index.json')
    await mkdir(cacheDir, { recursive: true })
    await writeFile(
      cachePath,
      JSON.stringify(
        {
          version: 2,
          generatedAt: '2026-01-01T00:00:00.000Z',
          entries: [
            {
              id: 'blog:2026/cached',
              type: 'blog',
              slug: '2026/cached',
              title: 'Cached Post',
              date: '2026-01-01T00:00:00.000Z',
              url: '/blog/2026/cached',
              document: 'articles/blog_2026_cached.json'
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    )
    const oldTimestamp = Date.now() / 1000 - 3600
    await utimes(cachePath, oldTimestamp, oldTimestamp)

    const fetchFn = vi.fn(async () => {
      throw new Error('network failed')
    }) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    const entries = await client.listLatestBlogs(1)
    expect(entries[0].id).toBe('blog:2026/cached')
  })

  it('throws when remote fetch fails and cache is missing', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network failed')
    }) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    await expect(client.listLatestBlogs(1)).rejects.toThrow('network failed')
  })

  it('filters only blog type and applies pagination', async () => {
    const indexPayload = {
      version: 2,
      generatedAt: '2026-01-01T00:00:00.000Z',
      entries: [
        {
          id: 'blog:2026/one',
          type: 'blog',
          slug: '2026/one',
          title: 'One',
          date: '2026-02-03T00:00:00.000Z',
          url: '/blog/2026/one',
          document: 'articles/blog_2026_one.json'
        },
        {
          id: 'topic:react-hooks',
          type: 'topic',
          slug: 'react-hooks',
          title: 'React Hooks',
          url: '/topics/react-hooks',
          document: 'articles/topic_react-hooks.json'
        },
        {
          id: 'blog:2026/two',
          type: 'blog',
          slug: '2026/two',
          title: 'Two',
          date: '2026-02-02T00:00:00.000Z',
          url: '/blog/2026/two',
          document: 'articles/blog_2026_two.json'
        }
      ]
    }

    const fetchFn = vi.fn(async () => makeJsonResponse(indexPayload)) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    const { entries, total } = await client.listBlogs(1, 1)
    expect(total).toBe(2)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('blog:2026/two')
  })

  it('searches blogs with weighted scoring', async () => {
    const indexPayload = {
      version: 2,
      generatedAt: '2026-01-01T00:00:00.000Z',
      entries: [
        {
          id: 'blog:2026/title-hit',
          type: 'blog',
          slug: '2026/something',
          title: 'Alpha in title',
          description: 'none',
          date: '2026-02-03T00:00:00.000Z',
          url: '/blog/2026/title-hit',
          document: 'articles/blog_2026_title-hit.json'
        },
        {
          id: 'blog:2026/slug-alpha',
          type: 'blog',
          slug: '2026/alpha-slug',
          title: 'No keyword',
          description: 'none',
          date: '2026-02-02T00:00:00.000Z',
          url: '/blog/2026/slug-alpha',
          document: 'articles/blog_2026_slug-alpha.json'
        },
        {
          id: 'blog:2026/desc-alpha',
          type: 'blog',
          slug: '2026/desc',
          title: 'No keyword',
          description: 'contains alpha in description',
          date: '2026-02-01T00:00:00.000Z',
          url: '/blog/2026/desc-alpha',
          document: 'articles/blog_2026_desc-alpha.json'
        }
      ]
    }

    const fetchFn = vi.fn(async () => makeJsonResponse(indexPayload)) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    const entries = await client.searchBlogs('alpha', 10)
    expect(entries.map((entry) => entry.id)).toEqual([
      'blog:2026/title-hit',
      'blog:2026/slug-alpha',
      'blog:2026/desc-alpha'
    ])
  })

  it('reads blog document by id and slug', async () => {
    const indexPayload = {
      version: 2,
      generatedAt: '2026-01-01T00:00:00.000Z',
      entries: [
        {
          id: 'blog:2026/read-me',
          type: 'blog',
          slug: '2026/read-me',
          title: 'Read Me',
          date: '2026-02-01T00:00:00.000Z',
          url: '/blog/2026/read-me',
          document: 'articles/blog_2026_read-me.json'
        }
      ]
    }
    const documentPayload = {
      ...indexPayload.entries[0],
      sourcePath: 'content/blog/2026/read-me.md',
      metadata: { tag: 'demo' },
      content: 'hello article body'
    }

    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const value = String(url)
      if (value.endsWith('/mcp/index.json')) return makeJsonResponse(indexPayload)
      if (value.endsWith('/mcp/articles/blog_2026_read-me.json')) return makeJsonResponse(documentPayload)
      throw new Error(`unexpected url: ${value}`)
    }) as unknown as typeof fetch

    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    const byId = await client.getBlogDocumentById('blog:2026/read-me')
    expect(byId.content).toContain('hello article body')

    const bySlug = await client.getBlogDocumentBySlug('2026/read-me')
    expect(bySlug.id).toBe('blog:2026/read-me')

    const cacheContent = await readFile(path.join(tempDir, 'cache', 'documents', 'blog_2026_read-me.json'), 'utf8')
    expect(cacheContent).toContain('hello article body')
  })
})
