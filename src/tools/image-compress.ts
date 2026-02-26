import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { compressImage, ImageFormatSchema, ResizeFitSchema } from '../lib/image.js'
import { errorResult, successResult } from '../lib/results.js'

export function registerImageCompressTool(server: McpServer): void {
  server.registerTool(
    'image_compress',
    {
      title: 'Compress image',
      description: 'Compress an image file and optionally resize it.',
      inputSchema: {
        input_path: z.string().min(1).describe('Source image path.'),
        output_path: z.string().min(1).optional().describe('Output image path.'),
        quality: z.number().int().min(1).max(100).optional().describe('Compression quality (1-100). Default: 80.'),
        format: ImageFormatSchema.optional().describe('Output image format. Defaults to source format.'),
        width: z.number().int().positive().optional().describe('Optional max width in pixels.'),
        height: z.number().int().positive().optional().describe('Optional max height in pixels.'),
        fit: ResizeFitSchema.optional().describe('Resize fit mode. Default: inside.')
      },
      annotations: {
        title: 'Compress image',
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (args) => {
      try {
        const result = await compressImage(args)
        return successResult({ tool: 'image_compress', ...result })
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
