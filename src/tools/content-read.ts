import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { formatBlogDocumentText } from '../lib/content/format.js'
import { errorResult } from '../lib/results.js'
import type { ContentToolContext } from './content-tool-context.js'

export function registerContentReadTool(server: McpServer, context: ContentToolContext): void {
  server.registerTool(
    'content_read',
    {
      title: 'Read one blog article',
      description: 'Read one blog article by id or slug.',
      inputSchema: {
        id: z.string().trim().min(1).optional().describe('Blog id.'),
        slug: z.string().trim().min(1).optional().describe('Blog slug.'),
        max_chars: z
          .number()
          .int()
          .min(200)
          .max(50000)
          .optional()
          .describe('Maximum output characters for content. Default: 12000.')
      },
      annotations: {
        title: 'Read one blog article',
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ id, slug, max_chars }) => {
      if (!id && !slug) {
        return errorResult('content_read requires either "id" or "slug".')
      }

      try {
        const maxChars = max_chars ?? 12000
        const document = id
          ? await context.contentClient.getBlogDocumentById(id)
          : await context.contentClient.getBlogDocumentBySlug(slug!)
        const formatted = formatBlogDocumentText(document, maxChars)
        return {
          structuredContent: { article: formatted.article },
          content: [
            {
              type: 'text',
              text: formatted.text
            }
          ]
        }
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
