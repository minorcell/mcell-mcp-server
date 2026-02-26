import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { formatBlogListText } from '../lib/content/format.js'
import { errorResult } from '../lib/results.js'
import type { ContentToolContext } from './content-tool-context.js'

export function registerContentListTool(server: McpServer, context: ContentToolContext): void {
  server.registerTool(
    'content_list',
    {
      title: 'List blog entries',
      description: 'List blog entries with pagination.',
      inputSchema: {
        count: z.number().int().min(1).max(100).optional().describe('Page size. Default: 20.'),
        offset: z.number().int().min(0).max(10000).optional().describe('Pagination offset. Default: 0.')
      },
      annotations: {
        title: 'List blog entries',
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ count = 20, offset = 0 }) => {
      try {
        const { entries, total } = await context.contentClient.listBlogs(count, offset)
        const end = entries.length > 0 ? offset + entries.length - 1 : offset
        return {
          structuredContent: { entries, total, count, offset },
          content: [
            {
              type: 'text',
              text: formatBlogListText(`Blog entries (${offset}-${end} / ${total})`, entries)
            }
          ]
        }
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
