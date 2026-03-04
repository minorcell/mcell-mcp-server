import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ContentBlogClient } from '../lib/content/client.js'
import type { NotificationService } from '../lib/notify.js'
import { registerContentLatestTool } from './content-latest.js'
import { registerContentListTool } from './content-list.js'
import { registerContentReadTool } from './content-read.js'
import { registerContentSearchTool } from './content-search.js'
import { registerImageCompressTool } from './image-compress.js'
import { registerImageConvertTool } from './image-convert.js'
import { registerNotifyTaskCompleteTool } from './notify-task-complete.js'
import { registerUploadToS3Tool } from './upload-to-s3.js'

export interface RegisterToolsOptions {
  contentClient: ContentBlogClient
  notificationService: NotificationService
}

export function registerTools(server: McpServer, options: RegisterToolsOptions): void {
  registerImageCompressTool(server)
  registerImageConvertTool(server)

  registerContentLatestTool(server, options)
  registerContentListTool(server, options)
  registerContentReadTool(server, options)
  registerContentSearchTool(server, options)

  registerUploadToS3Tool(server)
  registerNotifyTaskCompleteTool(server, { notificationService: options.notificationService })
}
