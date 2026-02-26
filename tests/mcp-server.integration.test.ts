import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentBlogClient } from '../src/lib/content/client.js'
import { createMcpServer } from '../src/index.js'
import { createSamplePng, createTempDir, parseToolTextContent, removeTempDir } from './test-helpers.js'

describe('mcp server integration', () => {
  let client: Client
  let server: ReturnType<typeof createMcpServer>
  let contentClient: ContentBlogClient
  let listLatestBlogs: ReturnType<typeof vi.fn>
  let listBlogs: ReturnType<typeof vi.fn>
  let searchBlogs: ReturnType<typeof vi.fn>
  let getBlogDocumentById: ReturnType<typeof vi.fn>
  let getBlogDocumentBySlug: ReturnType<typeof vi.fn>

  let tempDir = ''
  let sourcePng = ''

  beforeEach(async () => {
    listLatestBlogs = vi.fn(async () => [
      {
        id: 'blog:2026/demo',
        slug: '2026/demo',
        title: 'Demo Blog',
        url: '/blog/2026/demo',
        document: 'articles/blog_2026_demo.json'
      }
    ])
    listBlogs = vi.fn(async () => ({
      entries: [
        {
          id: 'blog:2026/demo',
          slug: '2026/demo',
          title: 'Demo Blog',
          url: '/blog/2026/demo',
          document: 'articles/blog_2026_demo.json'
        }
      ],
      total: 1
    }))
    searchBlogs = vi.fn(async () => [
      {
        id: 'blog:2026/demo',
        slug: '2026/demo',
        title: 'Demo Blog',
        url: '/blog/2026/demo',
        document: 'articles/blog_2026_demo.json'
      }
    ])
    getBlogDocumentById = vi.fn(async () => ({
      id: 'blog:2026/by-id',
      slug: '2026/by-id',
      title: 'By ID',
      url: '/blog/2026/by-id',
      sourcePath: 'content/blog/2026/by-id.md',
      metadata: {},
      content: 'by id content'
    }))
    getBlogDocumentBySlug = vi.fn(async () => ({
      id: 'blog:2026/by-slug',
      slug: '2026/by-slug',
      title: 'By Slug',
      url: '/blog/2026/by-slug',
      sourcePath: 'content/blog/2026/by-slug.md',
      metadata: {},
      content: 'by slug content'
    }))

    contentClient = {
      listLatestBlogs,
      listBlogs,
      searchBlogs,
      getBlogDocumentById,
      getBlogDocumentBySlug,
      refreshIndex: vi.fn(async () => {})
    }

    client = new Client({
      name: 'mcell-mcp-test-client',
      version: '1.0.0'
    })
    server = createMcpServer({ contentClient })

    tempDir = await createTempDir('mcell-mcp-int-')
    sourcePng = path.join(tempDir, 'source.png')
    await createSamplePng(sourcePng, 320, 240)

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  })

  afterEach(async () => {
    await client.close()
    await server.close()
    await removeTempDir(tempDir)
  })

  it('lists expected tool names', async () => {
    const tools = await client.listTools()
    const names = tools.tools.map((tool) => tool.name)

    expect(names).toEqual(
      expect.arrayContaining([
        'image_compress',
        'image_convert',
        's3_upload',
        'content_latest',
        'content_list',
        'content_read',
        'content_search'
      ])
    )
  })

  it('can call image_convert successfully', async () => {
    const outputPath = path.join(tempDir, 'from-mcp.webp')
    const result = await client.callTool({
      name: 'image_convert',
      arguments: {
        input_path: sourcePng,
        output_format: 'webp',
        output_path: outputPath
      }
    })

    expect(result.isError).toBeUndefined()
    const payload = parseToolTextContent(result) as { output_path: string; output_format: string; tool: string }
    expect(payload.tool).toBe('image_convert')
    expect(payload.output_path).toBe(outputPath)
    expect(payload.output_format).toBe('webp')
  })

  it('returns tool error for missing source image', async () => {
    const result = await client.callTool({
      name: 'image_convert',
      arguments: {
        input_path: path.join(tempDir, 'missing.png'),
        output_format: 'jpeg'
      }
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain('ENOENT')
  })

  it('calls content_latest successfully', async () => {
    const result = await client.callTool({
      name: 'content_latest',
      arguments: {
        count: 1
      }
    })

    expect(result.isError).toBeUndefined()
    expect(listLatestBlogs).toHaveBeenCalledWith(1)
    expect((result as { structuredContent?: unknown }).structuredContent).toEqual({
      entries: [
        {
          id: 'blog:2026/demo',
          slug: '2026/demo',
          title: 'Demo Blog',
          url: '/blog/2026/demo',
          document: 'articles/blog_2026_demo.json'
        }
      ]
    })
  })

  it('returns validation error when content_read has no id and slug', async () => {
    const result = await client.callTool({
      name: 'content_read',
      arguments: {}
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('requires either "id" or "slug"')
  })

  it('uses id precedence when both id and slug are provided', async () => {
    const result = await client.callTool({
      name: 'content_read',
      arguments: {
        id: 'blog:2026/by-id',
        slug: '2026/by-slug'
      }
    })

    expect(result.isError).toBeUndefined()
    expect(getBlogDocumentById).toHaveBeenCalledWith('blog:2026/by-id')
    expect(getBlogDocumentBySlug).not.toHaveBeenCalled()
    expect((result as { structuredContent?: { article?: { id?: string } } }).structuredContent?.article?.id).toBe(
      'blog:2026/by-id'
    )
  })
})
