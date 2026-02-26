import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { formatBlogListText } from '../lib/content/format.js'
import { errorResult } from '../lib/results.js'
import type { ContentToolContext } from './content-tool-context.js'

export function registerContentSearchTool(server: McpServer, context: ContentToolContext): void {
  server.registerTool(
    'content_search',
    {
      title: 'Search blog entries',
      description: 'Search blog entries by title, slug, and description.',
      inputSchema: {
        query: z.string().trim().min(1).describe('Search query.'),
        count: z.number().int().min(1).max(30).optional().describe('Maximum results. Default: 10.')
      },
      annotations: {
        title: 'Search blog entries',
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ query, count = 10 }) => {
      try {
        const entries = await context.contentClient.searchBlogs(query, count)
        return {
          structuredContent: { entries },
          content: [
            {
              type: 'text',
              text: formatBlogListText(`Search results for "${query}"`, entries)
            }
          ]
        }
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
