import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentBlogClient } from '../src/lib/content/client.js'
import type { NotificationService } from '../src/lib/notify.js'
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
  let notifyTaskComplete: ReturnType<typeof vi.fn>
  let notificationService: NotificationService

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

    notifyTaskComplete = vi.fn(async () => ({
      ok: true,
      task_name: 'demo task',
      status: 'success',
      title: 'Task completed: demo task',
      message: 'status=success',
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [{ target: 'system', channel: 'system', ok: true }]
    }))
    notificationService = { notifyTaskComplete }

    client = new Client({
      name: 'mcell-mcp-test-client',
      version: '1.0.0'
    })
    server = createMcpServer({ contentClient, notificationService })

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
        'content_search',
        'notify_task_complete'
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

  it('calls content_list successfully', async () => {
    const result = await client.callTool({
      name: 'content_list',
      arguments: {
        count: 1,
        offset: 0
      }
    })

    expect(result.isError).toBeUndefined()
    expect(listBlogs).toHaveBeenCalledWith(1, 0)
    expect((result as { structuredContent?: { total?: number } }).structuredContent?.total).toBe(1)
  })

  it('calls content_search successfully', async () => {
    const result = await client.callTool({
      name: 'content_search',
      arguments: {
        query: 'demo',
        count: 1
      }
    })

    expect(result.isError).toBeUndefined()
    expect(searchBlogs).toHaveBeenCalledWith('demo', 1)
    expect((result as { structuredContent?: { entries?: unknown[] } }).structuredContent?.entries).toHaveLength(1)
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

  it('reads article by slug when only slug is provided', async () => {
    const result = await client.callTool({
      name: 'content_read',
      arguments: {
        slug: '2026/by-slug'
      }
    })

    expect(result.isError).toBeUndefined()
    expect(getBlogDocumentBySlug).toHaveBeenCalledWith('2026/by-slug')
    expect((result as { structuredContent?: { article?: { id?: string } } }).structuredContent?.article?.id).toBe(
      'blog:2026/by-slug'
    )
  })

  it('returns tool error when content_latest fails', async () => {
    listLatestBlogs.mockRejectedValueOnce(new Error('list latest failed'))

    const result = await client.callTool({
      name: 'content_latest',
      arguments: {
        count: 1
      }
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('list latest failed')
  })

  it('returns tool error when content_list fails', async () => {
    listBlogs.mockRejectedValueOnce(new Error('list failed'))

    const result = await client.callTool({
      name: 'content_list',
      arguments: {
        count: 1
      }
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('list failed')
  })

  it('returns tool error when content_search fails', async () => {
    searchBlogs.mockRejectedValueOnce(new Error('search failed'))

    const result = await client.callTool({
      name: 'content_search',
      arguments: {
        query: 'demo'
      }
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('search failed')
  })

  it('returns tool error when content_read throws', async () => {
    getBlogDocumentById.mockRejectedValueOnce(new Error('read failed'))

    const result = await client.callTool({
      name: 'content_read',
      arguments: {
        id: 'blog:2026/by-id'
      }
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('read failed')
  })

  it('can call image_compress successfully', async () => {
    const outputPath = path.join(tempDir, 'from-mcp-compressed.jpg')
    const result = await client.callTool({
      name: 'image_compress',
      arguments: {
        input_path: sourcePng,
        output_path: outputPath,
        quality: 70,
        format: 'jpeg'
      }
    })

    expect(result.isError).toBeUndefined()
    const payload = parseToolTextContent(result) as { output_path: string; output_format: string; tool: string }
    expect(payload.tool).toBe('image_compress')
    expect(payload.output_path).toBe(outputPath)
    expect(payload.output_format).toBe('jpeg')
  })

  it('returns tool error for missing source in image_compress', async () => {
    const result = await client.callTool({
      name: 'image_compress',
      arguments: {
        input_path: path.join(tempDir, 'missing-source.png'),
        quality: 70
      }
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('ENOENT')
  })

  it('returns tool error for s3_upload when source file is missing', async () => {
    const result = await client.callTool({
      name: 's3_upload',
      arguments: {
        file_path: path.join(tempDir, 'missing.txt'),
        bucket: 'demo',
        key: 'missing.txt'
      }
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('ENOENT')
  })

  it('can call notify_task_complete successfully', async () => {
    const result = await client.callTool({
      name: 'notify_task_complete',
      arguments: {
        task_name: 'long task',
        status: 'success',
        summary: 'done',
        duration_sec: 42,
        target: ['system']
      }
    })

    expect(result.isError).toBeUndefined()
    expect(notifyTaskComplete).toHaveBeenCalledWith({
      task_name: 'long task',
      status: 'success',
      summary: 'done',
      duration_sec: 42,
      target: ['system']
    })

    const payload = parseToolTextContent(result) as { tool: string; ok: boolean; task_name: string }
    expect(payload.tool).toBe('notify_task_complete')
    expect(payload.ok).toBe(true)
    expect(payload.task_name).toBe('demo task')
  })

  it('marks notify_task_complete as tool error when result is not ok', async () => {
    notifyTaskComplete.mockResolvedValueOnce({
      ok: false,
      task_name: 'notify-fail',
      status: 'failed',
      title: 'Task failed: notify-fail',
      message: 'status=failed',
      total: 2,
      succeeded: 1,
      failed: 1,
      results: [
        { target: 'system', channel: 'system', ok: true },
        { target: 'feishu', channel: 'webhook', ok: false, error: 'Webhook request failed (500).' }
      ]
    })

    const result = await client.callTool({
      name: 'notify_task_complete',
      arguments: {
        task_name: 'notify-fail',
        target: ['system', 'feishu']
      }
    })

    expect(result.isError).toBe(true)
    const payload = parseToolTextContent(result) as { tool: string; ok: boolean; failed: number }
    expect(payload.tool).toBe('notify_task_complete')
    expect(payload.ok).toBe(false)
    expect(payload.failed).toBe(1)
  })

  it('returns tool error when notify_task_complete throws', async () => {
    notifyTaskComplete.mockRejectedValueOnce(new Error('notify threw'))

    const result = await client.callTool({
      name: 'notify_task_complete',
      arguments: {
        task_name: 'throw-case'
      }
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('notify threw')
  })
})
