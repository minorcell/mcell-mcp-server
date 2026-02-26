import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { convertImage, ImageFormatSchema } from '../lib/image.js'
import { errorResult, successResult } from '../lib/results.js'

export function registerImageConvertTool(server: McpServer): void {
  server.registerTool(
    'image_convert',
    {
      title: 'Convert image format',
      description: 'Convert an image to a target format.',
      inputSchema: {
        input_path: z.string().min(1).describe('Source image path.'),
        output_format: ImageFormatSchema.describe('Target image format.'),
        output_path: z.string().min(1).optional().describe('Output image path.'),
        quality: z.number().int().min(1).max(100).optional().describe('Quality (1-100). Default: 85.')
      },
      annotations: {
        title: 'Convert image format',
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (args) => {
      try {
        const result = await convertImage(args)
        return successResult({ tool: 'image_convert', ...result })
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
