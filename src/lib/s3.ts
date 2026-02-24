import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import type { PutObjectCommandOutput, S3ClientConfig } from "@aws-sdk/client-s3";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import mime from "mime-types";
import { ensureReadableFile, resolvePath } from "./files.js";

type S3ClientLike = {
  send(command: PutObjectCommand): Promise<PutObjectCommandOutput>;
};

type UploadToS3Deps = {
  createS3Client?: (config: S3ClientConfig) => S3ClientLike;
  createReadStreamFn?: typeof createReadStream;
  lookupMimeType?: typeof mime.lookup;
};

export type UploadToS3Input = {
  file_path: string;
  bucket: string;
  key: string;
  region?: string;
  endpoint?: string;
  force_path_style?: boolean;
  content_type?: string;
  metadata?: Record<string, string>;
  cwd?: string;
};

export type S3UploadResult = {
  ok: true;
  file_path: string;
  size_bytes: number;
  bucket: string;
  key: string;
  region: string;
  endpoint: string | null;
  e_tag: string | null;
  version_id: string | null;
  location: string;
};

export async function uploadToS3(
  args: UploadToS3Input,
  deps: UploadToS3Deps = {}
): Promise<S3UploadResult> {
  const cwd = args.cwd ?? process.cwd();
  const filePath = resolvePath(args.file_path, cwd);
  await ensureReadableFile(filePath);

  const fileStats = await fs.stat(filePath);
  const region = args.region ?? process.env.AWS_REGION ?? "us-east-1";
  const lookupMimeType = deps.lookupMimeType ?? mime.lookup;
  const detectedContentType = lookupMimeType(filePath);

  const createClient = deps.createS3Client ?? ((config: S3ClientConfig) => new S3Client(config));
  const readStreamFactory = deps.createReadStreamFn ?? createReadStream;
  const client = createClient({
    region,
    endpoint: args.endpoint,
    forcePathStyle: args.force_path_style ?? false
  });

  const putResult = await client.send(
    new PutObjectCommand({
      Bucket: args.bucket,
      Key: args.key,
      Body: readStreamFactory(filePath),
      ContentType:
        args.content_type ?? (typeof detectedContentType === "string" ? detectedContentType : undefined),
      Metadata: args.metadata
    })
  );

  return {
    ok: true,
    file_path: filePath,
    size_bytes: fileStats.size,
    bucket: args.bucket,
    key: args.key,
    region,
    endpoint: args.endpoint ?? null,
    e_tag: putResult.ETag ?? null,
    version_id: putResult.VersionId ?? null,
    location: `s3://${args.bucket}/${args.key}`
  };
}
