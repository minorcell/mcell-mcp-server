import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { formatBlogListText } from '../lib/content/format.js'
import { errorResult } from '../lib/results.js'
import type { ContentToolContext } from './content-tool-context.js'

export function registerContentLatestTool(server: McpServer, context: ContentToolContext): void {
  server.registerTool(
    'content_latest',
    {
      title: 'Latest blog entries',
      description: 'Read latest blog entries.',
      inputSchema: {
        count: z.number().int().min(1).max(20).optional().describe('Number of latest blog entries. Default: 1.')
      },
      annotations: {
        title: 'Latest blog entries',
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ count = 1 }) => {
      try {
        const entries = await context.contentClient.listLatestBlogs(count)
        return {
          structuredContent: { entries },
          content: [
            {
              type: 'text',
              text: formatBlogListText(`Latest ${entries.length} blog entries`, entries)
            }
          ]
        }
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
