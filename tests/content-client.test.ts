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

  it('returns empty result for blank search query', async () => {
    const fetchFn = vi.fn(async () =>
      makeJsonResponse({ version: 1, generatedAt: '2026-01-01T00:00:00.000Z', entries: [] })
    ) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    const entries = await client.searchBlogs('   ', 10)
    expect(entries).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refreshes index when refreshIndex is called', async () => {
    const indexPayload = {
      version: 2,
      generatedAt: '2026-01-01T00:00:00.000Z',
      entries: [
        {
          id: 'blog:2026/a',
          type: 'blog',
          slug: '2026/a',
          title: 'A',
          url: '/blog/2026/a',
          document: 'articles/blog_2026_a.json'
        }
      ]
    }
    const fetchFn = vi.fn(async () => makeJsonResponse(indexPayload)) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    await client.refreshIndex()
    await client.listLatestBlogs(1)

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('reads fresh index from disk cache without remote fetch', async () => {
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
              id: 'blog:2026/cached-fresh',
              type: 'blog',
              slug: '2026/cached-fresh',
              title: 'Cached Fresh',
              url: '/blog/2026/cached-fresh',
              document: 'articles/blog_2026_cached-fresh.json'
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    )

    const fetchFn = vi.fn(async () => {
      throw new Error('should not fetch')
    }) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    const entries = await client.listLatestBlogs(1)
    expect(entries[0].id).toBe('blog:2026/cached-fresh')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('ignores corrupted disk cache and fetches remote data', async () => {
    const cacheDir = path.join(tempDir, 'cache')
    const cachePath = path.join(cacheDir, 'index.json')
    await mkdir(cacheDir, { recursive: true })
    await writeFile(cachePath, 'not-json', 'utf8')

    const indexPayload = {
      version: 2,
      generatedAt: '2026-01-01T00:00:00.000Z',
      entries: [
        {
          id: 'blog:2026/remote',
          type: 'blog',
          slug: '2026/remote',
          title: 'Remote',
          url: '/blog/2026/remote',
          document: 'articles/blog_2026_remote.json'
        }
      ]
    }
    const fetchFn = vi.fn(async () => makeJsonResponse(indexPayload)) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    const entries = await client.listLatestBlogs(1)
    expect(entries[0].id).toBe('blog:2026/remote')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('throws on non-OK index response', async () => {
    const fetchFn = vi.fn(async () => new Response('bad', { status: 500 })) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })
    await expect(client.listLatestBlogs(1)).rejects.toThrow('Request failed (500)')
  })

  it('throws for malformed index payload shape', async () => {
    const fetchFn = vi.fn(async () => makeJsonResponse([])) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })
    await expect(client.listLatestBlogs(1)).rejects.toThrow('Invalid dataset index payload')
  })

  it('throws for malformed index entries field', async () => {
    const fetchFn = vi.fn(async () =>
      makeJsonResponse({ generatedAt: '2026-01-01T00:00:00.000Z', entries: {} })
    ) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })
    await expect(client.listLatestBlogs(1)).rejects.toThrow('Invalid dataset index entries')
  })

  it('throws for non-object dataset entry values', async () => {
    const fetchFn = vi.fn(async () =>
      makeJsonResponse({
        generatedAt: '2026-01-01T00:00:00.000Z',
        entries: [42]
      })
    ) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })
    await expect(client.listLatestBlogs(1)).rejects.toThrow('Invalid dataset entry')
  })

  it('throws for malformed required entry fields', async () => {
    const fetchFn = vi.fn(async () =>
      makeJsonResponse({
        generatedAt: '2026-01-01T00:00:00.000Z',
        entries: [{ type: 'blog', slug: 'x', title: 'x', url: '/x', document: 'articles/x.json' }]
      })
    ) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })
    await expect(client.listLatestBlogs(1)).rejects.toThrow('Invalid field "id"')
  })

  it('throws for malformed optional string field', async () => {
    const fetchFn = vi.fn(async () =>
      makeJsonResponse({
        generatedAt: '2026-01-01T00:00:00.000Z',
        entries: [
          {
            id: 'blog:bad-desc',
            type: 'blog',
            slug: 'bad-desc',
            title: 'Bad desc',
            description: 123,
            url: '/blog/bad-desc',
            document: 'articles/bad-desc.json'
          }
        ]
      })
    ) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })
    await expect(client.listLatestBlogs(1)).rejects.toThrow('Invalid field "description"')
  })

  it('throws for malformed optional number field', async () => {
    const fetchFn = vi.fn(async () =>
      makeJsonResponse({
        generatedAt: '2026-01-01T00:00:00.000Z',
        entries: [
          {
            id: 'blog:bad-order',
            type: 'blog',
            slug: 'bad-order',
            title: 'Bad order',
            order: '1',
            url: '/blog/bad-order',
            document: 'articles/bad-order.json'
          }
        ]
      })
    ) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })
    await expect(client.listLatestBlogs(1)).rejects.toThrow('Invalid field "order"')
  })

  it('throws when blog id or slug cannot be found', async () => {
    const fetchFn = vi.fn(async () =>
      makeJsonResponse({
        generatedAt: '2026-01-01T00:00:00.000Z',
        entries: []
      })
    ) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    await expect(client.getBlogDocumentById('blog:missing')).rejects.toThrow('Blog not found by id')
    await expect(client.getBlogDocumentBySlug('missing')).rejects.toThrow('Blog not found by slug')
  })

  it('throws when resolved document is not a blog', async () => {
    const indexPayload = {
      generatedAt: '2026-01-01T00:00:00.000Z',
      entries: [
        {
          id: 'blog:2026/not-blog-doc',
          type: 'blog',
          slug: '2026/not-blog-doc',
          title: 'Not Blog Doc',
          url: '/blog/2026/not-blog-doc',
          document: 'articles/not-blog-doc.json'
        }
      ]
    }
    const documentPayload = {
      id: 'blog:2026/not-blog-doc',
      type: 'topic',
      slug: '2026/not-blog-doc',
      title: 'Not Blog Doc',
      url: '/blog/2026/not-blog-doc',
      document: 'articles/not-blog-doc.json',
      sourcePath: 'content/topic/not-blog-doc.md',
      metadata: {},
      content: 'topic payload'
    }

    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const value = String(url)
      if (value.endsWith('/mcp/index.json')) return makeJsonResponse(indexPayload)
      if (value.endsWith('/mcp/articles/not-blog-doc.json')) return makeJsonResponse(documentPayload)
      throw new Error(`unexpected url: ${value}`)
    }) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    await expect(client.getBlogDocumentById('blog:2026/not-blog-doc')).rejects.toThrow('Resource is not a blog')
    await expect(client.getBlogDocumentBySlug('2026/not-blog-doc')).rejects.toThrow('Resource is not a blog')
  })

  it('loads document from fresh disk cache without requesting document url', async () => {
    const cacheDir = path.join(tempDir, 'cache')
    const docsDir = path.join(cacheDir, 'documents')
    await mkdir(docsDir, { recursive: true })
    await writeFile(
      path.join(cacheDir, 'index.json'),
      JSON.stringify(
        {
          generatedAt: '2026-01-01T00:00:00.000Z',
          entries: [
            {
              id: 'blog:2026/from-cache',
              type: 'blog',
              slug: '2026/from-cache',
              title: 'From Cache',
              url: '/blog/2026/from-cache',
              document: 'articles/from-cache.json'
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    )
    await writeFile(
      path.join(docsDir, 'blog_2026_from-cache.json'),
      JSON.stringify(
        {
          id: 'blog:2026/from-cache',
          type: 'blog',
          slug: '2026/from-cache',
          title: 'From Cache',
          url: '/blog/2026/from-cache',
          document: 'articles/from-cache.json',
          sourcePath: 'content/blog/2026/from-cache.md',
          metadata: {},
          content: 'cached body'
        },
        null,
        2
      ),
      'utf8'
    )

    const fetchFn = vi.fn(async () => {
      throw new Error('document should be loaded from disk cache')
    }) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })
    const byId = await client.getBlogDocumentById('blog:2026/from-cache')
    expect(byId.content).toBe('cached body')
  })

  it('falls back to stale document cache when remote document fetch fails', async () => {
    const cacheDir = path.join(tempDir, 'cache')
    const docsDir = path.join(cacheDir, 'documents')
    const docCachePath = path.join(docsDir, 'blog_2026_stale-doc.json')
    await mkdir(docsDir, { recursive: true })
    await writeFile(
      path.join(cacheDir, 'index.json'),
      JSON.stringify(
        {
          generatedAt: '2026-01-01T00:00:00.000Z',
          entries: [
            {
              id: 'blog:2026/stale-doc',
              type: 'blog',
              slug: '2026/stale-doc',
              title: 'Stale Doc',
              url: '/blog/2026/stale-doc',
              document: 'articles/stale-doc.json'
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    )
    await writeFile(
      docCachePath,
      JSON.stringify(
        {
          id: 'blog:2026/stale-doc',
          type: 'blog',
          slug: '2026/stale-doc',
          title: 'Stale Doc',
          url: '/blog/2026/stale-doc',
          document: 'articles/stale-doc.json',
          sourcePath: 'content/blog/2026/stale-doc.md',
          metadata: {},
          content: 'stale cache content'
        },
        null,
        2
      ),
      'utf8'
    )
    const oldTimestamp = Date.now() / 1000 - 3600
    await utimes(docCachePath, oldTimestamp, oldTimestamp)

    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const value = String(url)
      if (value.endsWith('/mcp/index.json')) {
        return makeJsonResponse({
          generatedAt: '2026-01-01T00:00:00.000Z',
          entries: [
            {
              id: 'blog:2026/stale-doc',
              type: 'blog',
              slug: '2026/stale-doc',
              title: 'Stale Doc',
              url: '/blog/2026/stale-doc',
              document: 'articles/stale-doc.json'
            }
          ]
        })
      }
      throw new Error('document remote failed')
    }) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })
    const byId = await client.getBlogDocumentById('blog:2026/stale-doc')
    expect(byId.content).toContain('stale cache content')
  })

  it('throws when document fetch fails and no document cache exists', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const value = String(url)
      if (value.endsWith('/mcp/index.json')) {
        return makeJsonResponse({
          generatedAt: '2026-01-01T00:00:00.000Z',
          entries: [
            {
              id: 'blog:2026/no-doc-cache',
              type: 'blog',
              slug: '2026/no-doc-cache',
              title: 'No Doc Cache',
              url: '/blog/2026/no-doc-cache',
              document: 'articles/no-doc-cache.json'
            }
          ]
        })
      }
      throw new Error('document fetch failed hard')
    }) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })
    await expect(client.getBlogDocumentById('blog:2026/no-doc-cache')).rejects.toThrow('document fetch failed hard')
  })

  it('throws when document payload content is not a string', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const value = String(url)
      if (value.endsWith('/mcp/index.json')) {
        return makeJsonResponse({
          generatedAt: '2026-01-01T00:00:00.000Z',
          entries: [
            {
              id: 'blog:2026/bad-content',
              type: 'blog',
              slug: '2026/bad-content',
              title: 'Bad Content',
              url: '/blog/2026/bad-content',
              document: 'articles/bad-content.json'
            }
          ]
        })
      }
      return makeJsonResponse({
        id: 'blog:2026/bad-content',
        type: 'blog',
        slug: '2026/bad-content',
        title: 'Bad Content',
        url: '/blog/2026/bad-content',
        document: 'articles/bad-content.json',
        sourcePath: 'content/blog/2026/bad-content.md',
        metadata: {},
        content: 123
      })
    }) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })
    await expect(client.getBlogDocumentById('blog:2026/bad-content')).rejects.toThrow('Invalid field "content"')
  })

  it('throws when document payload is not an object', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const value = String(url)
      if (value.endsWith('/mcp/index.json')) {
        return makeJsonResponse({
          generatedAt: '2026-01-01T00:00:00.000Z',
          entries: [
            {
              id: 'blog:2026/bad-doc-shape',
              type: 'blog',
              slug: '2026/bad-doc-shape',
              title: 'Bad Doc Shape',
              url: '/blog/2026/bad-doc-shape',
              document: 'articles/bad-doc-shape.json'
            }
          ]
        })
      }
      return makeJsonResponse([])
    }) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })
    await expect(client.getBlogDocumentById('blog:2026/bad-doc-shape')).rejects.toThrow(
      'Invalid dataset document payload'
    )
  })

  it('covers date and order fallback sorting branches', async () => {
    const fetchFn = vi.fn(async () =>
      makeJsonResponse({
        generatedAt: '2026-01-01T00:00:00.000Z',
        entries: [
          {
            id: 'blog:2026/date-only',
            type: 'blog',
            slug: '2026/date-only',
            title: 'Date Only',
            date: '2026-02-05T00:00:00.000Z',
            url: '/blog/2026/date-only',
            document: 'articles/date-only.json'
          },
          {
            id: 'blog:2026/order-one',
            type: 'blog',
            slug: '2026/order-one',
            title: 'Order One',
            order: 1,
            url: '/blog/2026/order-one',
            document: 'articles/order-one.json'
          },
          {
            id: 'blog:2026/order-two',
            type: 'blog',
            slug: '2026/order-two',
            title: 'Order Two',
            order: 2,
            url: '/blog/2026/order-two',
            document: 'articles/order-two.json'
          },
          {
            id: 'blog:2026/no-order',
            type: 'blog',
            slug: '2026/no-order',
            title: 'No Order',
            url: '/blog/2026/no-order',
            document: 'articles/no-order.json'
          }
        ]
      })
    ) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    const entries = await client.listLatestBlogs(10)
    expect(entries.map((entry) => entry.id)).toEqual([
      'blog:2026/date-only',
      'blog:2026/order-one',
      'blog:2026/order-two',
      'blog:2026/no-order'
    ])
  })

  it('uses title sorting when date and order are both missing', async () => {
    const fetchFn = vi.fn(async () =>
      makeJsonResponse({
        generatedAt: '2026-01-01T00:00:00.000Z',
        entries: [
          {
            id: 'blog:2026/title-b',
            type: 'blog',
            slug: '2026/title-b',
            title: 'B title',
            url: '/blog/2026/title-b',
            document: 'articles/title-b.json'
          },
          {
            id: 'blog:2026/title-a',
            type: 'blog',
            slug: '2026/title-a',
            title: 'A title',
            url: '/blog/2026/title-a',
            document: 'articles/title-a.json'
          }
        ]
      })
    ) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    const entries = await client.listLatestBlogs(10)
    expect(entries.map((entry) => entry.id)).toEqual(['blog:2026/title-a', 'blog:2026/title-b'])
  })

  it('uses compareEntries tie-breaker when search scores are equal', async () => {
    const fetchFn = vi.fn(async () =>
      makeJsonResponse({
        generatedAt: '2026-01-01T00:00:00.000Z',
        entries: [
          {
            id: 'blog:2026/alpha-b',
            type: 'blog',
            slug: '2026/a',
            title: 'Alpha',
            order: 2,
            url: '/blog/2026/alpha-b',
            document: 'articles/alpha-b.json'
          },
          {
            id: 'blog:2026/alpha-a',
            type: 'blog',
            slug: '2026/b',
            title: 'Alpha',
            order: 1,
            url: '/blog/2026/alpha-a',
            document: 'articles/alpha-a.json'
          }
        ]
      })
    ) as unknown as typeof fetch
    const client = new ContentDatasetClient(createConfig(), { fetchFn })

    const entries = await client.searchBlogs('alpha', 10)
    expect(entries.map((entry) => entry.id)).toEqual(['blog:2026/alpha-a', 'blog:2026/alpha-b'])
  })
})
