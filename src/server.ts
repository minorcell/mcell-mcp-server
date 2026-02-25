import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { compressImage, convertImage, ImageFormatSchema, ResizeFitSchema } from "./lib/image.js";
import { errorResult, successResult } from "./lib/results.js";
import { uploadToS3 } from "./lib/s3.js";

export const SERVER_NAME = "mcell-mcp-server";
export const SERVER_VERSION = "0.1.2";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  server.registerTool(
    "image_compress",
    {
      title: "Compress image",
      description: "Compress an image file and optionally resize it.",
      inputSchema: {
        input_path: z.string().min(1).describe("Source image path."),
        output_path: z.string().min(1).optional().describe("Output image path."),
        quality: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Compression quality (1-100). Default: 80."),
        format: ImageFormatSchema.optional().describe("Output image format. Defaults to source format."),
        width: z.number().int().positive().optional().describe("Optional max width in pixels."),
        height: z.number().int().positive().optional().describe("Optional max height in pixels."),
        fit: ResizeFitSchema.optional().describe("Resize fit mode. Default: inside.")
      },
      annotations: {
        title: "Compress image",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (args) => {
      try {
        const result = await compressImage(args);
        return successResult({ tool: "image_compress", ...result });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "image_convert",
    {
      title: "Convert image format",
      description: "Convert an image to a target format.",
      inputSchema: {
        input_path: z.string().min(1).describe("Source image path."),
        output_format: ImageFormatSchema.describe("Target image format."),
        output_path: z.string().min(1).optional().describe("Output image path."),
        quality: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Quality (1-100). Default: 85.")
      },
      annotations: {
        title: "Convert image format",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (args) => {
      try {
        const result = await convertImage(args);
        return successResult({ tool: "image_convert", ...result });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "s3_upload",
    {
      title: "Upload file to S3",
      description: "Upload a local file to S3 or S3-compatible object storage.",
      inputSchema: {
        file_path: z.string().min(1).describe("Local file path to upload."),
        bucket: z.string().min(1).describe("Target bucket name."),
        key: z.string().min(1).describe("Target object key in bucket."),
        region: z
          .string()
          .min(1)
          .optional()
          .describe("AWS region. Default: AWS_REGION or us-east-1."),
        endpoint: z
          .string()
          .url()
          .optional()
          .describe("Optional endpoint for S3-compatible providers."),
        force_path_style: z
          .boolean()
          .optional()
          .describe("Use path-style addressing for S3-compatible providers."),
        content_type: z.string().min(1).optional().describe("Optional explicit Content-Type header."),
        metadata: z
          .record(z.string(), z.string())
          .optional()
          .describe("Optional metadata key/value pairs.")
      },
      annotations: {
        title: "Upload file to S3",
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (args) => {
      try {
        const result = await uploadToS3(args);
        return successResult({ tool: "s3_upload", ...result });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  return server;
}
