#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcell-mcp-server] running on stdio");
}

main().catch((error) => {
  console.error("[mcell-mcp-server] fatal:", error);
  process.exit(1);
});
