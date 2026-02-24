import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpServer } from "../src/server.js";
import { createSamplePng, createTempDir, parseToolTextContent, removeTempDir } from "./test-helpers.js";

describe("mcp server integration", () => {
  let client: Client;
  let server: ReturnType<typeof createMcpServer>;

  let tempDir = "";
  let sourcePng = "";

  beforeEach(async () => {
    client = new Client({
      name: "mcell-mcp-test-client",
      version: "1.0.0"
    });
    server = createMcpServer();

    tempDir = await createTempDir("mcell-mcp-int-");
    sourcePng = path.join(tempDir, "source.png");
    await createSamplePng(sourcePng, 320, 240);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    await removeTempDir(tempDir);
  });

  it("lists expected tool names", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);

    expect(names).toEqual(expect.arrayContaining(["image_compress", "image_convert", "s3_upload"]));
  });

  it("can call image_convert successfully", async () => {
    const outputPath = path.join(tempDir, "from-mcp.webp");
    const result = await client.callTool({
      name: "image_convert",
      arguments: {
        input_path: sourcePng,
        output_format: "webp",
        output_path: outputPath
      }
    });

    expect(result.isError).toBeUndefined();
    const payload = parseToolTextContent(result) as { output_path: string; output_format: string; tool: string };
    expect(payload.tool).toBe("image_convert");
    expect(payload.output_path).toBe(outputPath);
    expect(payload.output_format).toBe("webp");
  });

  it("returns tool error for missing source image", async () => {
    const result = await client.callTool({
      name: "image_convert",
      arguments: {
        input_path: path.join(tempDir, "missing.png"),
        output_format: "jpeg"
      }
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("ENOENT");
  });
});
