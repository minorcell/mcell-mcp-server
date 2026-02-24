import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { minify } from "terser";

const DIST_DIR = path.resolve(process.cwd(), "dist");

async function collectJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsFiles(fullPath)));
    } else if (entry.isFile() && fullPath.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function minifyFile(filePath) {
  const original = await readFile(filePath, "utf8");
  let body = original;
  let shebang = "";

  if (original.startsWith("#!")) {
    const firstLineBreak = original.indexOf("\n");
    if (firstLineBreak >= 0) {
      shebang = original.slice(0, firstLineBreak + 1);
      body = original.slice(firstLineBreak + 1);
    }
  }

  const result = await minify(body, {
    module: true,
    compress: true,
    mangle: true
  });

  if (!result.code) {
    throw new Error(`Minification failed: ${filePath}`);
  }

  await writeFile(filePath, shebang + result.code, "utf8");
}

async function main() {
  const jsFiles = await collectJsFiles(DIST_DIR);
  await Promise.all(jsFiles.map((filePath) => minifyFile(filePath)));
}

main().catch((error) => {
  console.error("[minify] failed:", error);
  process.exit(1);
});
