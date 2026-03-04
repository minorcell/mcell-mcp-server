import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, it, vi } from 'vitest'
import { parseToolTextContent } from './test-helpers.js'

vi.mock('../src/lib/s3.js', () => ({
  uploadToS3: vi.fn()
}))

import { uploadToS3 } from '../src/lib/s3.js'
import { registerUploadToS3Tool } from '../src/tools/upload-to-s3.js'

type ToolHandler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text?: string }> }>

describe('registerUploadToS3Tool', () => {
  it('returns success payload when upload succeeds', async () => {
    const handlerMap = new Map<string, ToolHandler>()
    const server = {
      registerTool: (name: string, _meta: unknown, handler: ToolHandler) => {
        handlerMap.set(name, handler)
      }
    } as unknown as McpServer

    registerUploadToS3Tool(server)
    const handler = handlerMap.get('s3_upload')
    expect(handler).toBeDefined()

    vi.mocked(uploadToS3).mockResolvedValueOnce({
      ok: true,
      file_path: '/tmp/demo.txt',
      size_bytes: 10,
      bucket: 'my-bucket',
      key: 'docs/demo.txt',
      region: 'us-east-1',
      endpoint: null,
      e_tag: '"etag"',
      version_id: null,
      location: 's3://my-bucket/docs/demo.txt'
    })

    const result = await handler!({
      file_path: '/tmp/demo.txt',
      bucket: 'my-bucket',
      key: 'docs/demo.txt'
    })

    expect(result.isError).toBeUndefined()
    expect(parseToolTextContent(result)).toEqual(
      expect.objectContaining({
        tool: 's3_upload',
        ok: true,
        bucket: 'my-bucket'
      })
    )
  })

  it('returns tool error when upload throws', async () => {
    const handlerMap = new Map<string, ToolHandler>()
    const server = {
      registerTool: (name: string, _meta: unknown, handler: ToolHandler) => {
        handlerMap.set(name, handler)
      }
    } as unknown as McpServer

    registerUploadToS3Tool(server)
    const handler = handlerMap.get('s3_upload')
    expect(handler).toBeDefined()

    vi.mocked(uploadToS3).mockRejectedValueOnce(new Error('upload failed'))

    const result = await handler!({
      file_path: '/tmp/demo.txt',
      bucket: 'my-bucket',
      key: 'docs/demo.txt'
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('upload failed')
  })
})
