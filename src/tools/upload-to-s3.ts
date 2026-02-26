import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { errorResult, successResult } from '../lib/results.js'
import { uploadToS3 } from '../lib/s3.js'

export function registerUploadToS3Tool(server: McpServer): void {
  server.registerTool(
    's3_upload',
    {
      title: 'Upload file to S3',
      description: 'Upload a local file to S3 or S3-compatible object storage.',
      inputSchema: {
        file_path: z.string().min(1).describe('Local file path to upload.'),
        bucket: z.string().min(1).describe('Target bucket name.'),
        key: z.string().min(1).describe('Target object key in bucket.'),
        region: z.string().min(1).optional().describe('AWS region. Default: AWS_REGION or us-east-1.'),
        endpoint: z.string().url().optional().describe('Optional endpoint for S3-compatible providers.'),
        force_path_style: z.boolean().optional().describe('Use path-style addressing for S3-compatible providers.'),
        content_type: z.string().min(1).optional().describe('Optional explicit Content-Type header.'),
        metadata: z.record(z.string(), z.string()).optional().describe('Optional metadata key/value pairs.')
      },
      annotations: {
        title: 'Upload file to S3',
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (args) => {
      try {
        const result = await uploadToS3(args)
        return successResult({ tool: 's3_upload', ...result })
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
