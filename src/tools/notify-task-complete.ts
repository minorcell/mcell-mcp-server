import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import type { NotificationService } from '../lib/notify.js'
import { errorResult, successResult } from '../lib/results.js'

export interface NotifyToolContext {
  notificationService: NotificationService
}

export function registerNotifyTaskCompleteTool(server: McpServer, context: NotifyToolContext): void {
  server.registerTool(
    'notify_task_complete',
    {
      title: 'Send task completion notification',
      description: 'Send task completion notifications to system and configured webhook targets.',
      inputSchema: {
        task_name: z.string().trim().min(1).describe('Task name.'),
        status: z
          .enum(['success', 'failed', 'cancelled'])
          .optional()
          .describe('Task completion status. Default: success.'),
        summary: z.string().optional().describe('Optional summary text for the notification body.'),
        duration_sec: z.number().min(0).optional().describe('Optional task duration in seconds.'),
        target: z
          .array(z.string().trim().min(1))
          .min(1)
          .optional()
          .describe('Target channels, e.g. ["system", "feishu", "wecom"]. Default: ["system"].'),
        webhook_payloads: z
          .record(z.string().trim().min(1), z.unknown())
          .optional()
          .describe('Optional per-target payload override for webhook targets.'),
        webhook_timeout_ms: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Webhook request timeout in milliseconds. Default: MCELL_NOTIFY_WEBHOOK_TIMEOUT_MS or 10000.')
      },
      annotations: {
        title: 'Send task completion notification',
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (args) => {
      try {
        const result = await context.notificationService.notifyTaskComplete(args)
        const payload = { tool: 'notify_task_complete', ...result }

        if (result.ok) {
          return successResult(payload)
        }

        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(payload, null, 2)
            }
          ]
        }
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
