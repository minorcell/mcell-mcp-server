#!/usr/bin/env node

import { pathToFileURL } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ContentDatasetClient, type ContentBlogClient } from './lib/content/client.js'
import { loadContentConfig } from './lib/content/config.js'
import { createNotificationService, type NotificationService } from './lib/notify.js'
import { registerTools } from './tools/index.js'

export const SERVER_NAME = 'mcell-mcp-server'
export const SERVER_VERSION = '0.1.2'

export interface CreateMcpServerOptions {
  contentClient?: ContentBlogClient
  notificationService?: NotificationService
}

export function createMcpServer(options: CreateMcpServerOptions = {}): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  })

  const contentClient = options.contentClient ?? new ContentDatasetClient(loadContentConfig())
  const notificationService = options.notificationService ?? createNotificationService()
  registerTools(server, { contentClient, notificationService })

  return server
}

async function main(): Promise<void> {
  const server = createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[mcell-mcp-server] running on stdio')
}

function isExecutedAsEntrypoint(): boolean {
  if (!process.argv[1]) return false
  return pathToFileURL(process.argv[1]).href === import.meta.url
}

if (isExecutedAsEntrypoint()) {
  main().catch((error) => {
    console.error('[mcell-mcp-server] fatal:', error)
    process.exit(1)
  })
}
