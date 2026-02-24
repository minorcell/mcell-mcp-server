# mcell-mcp-server

`mcell-mcp-server` 是一个基于 `stdio` 的 MCP Server，定位为 mcell 常用工具合集。当前内置：

1. 图片处理：压缩（可选 resize）、格式转换
2. S3 对象存储上传

## 工具列表

### 1) `image_compress`

压缩图片，可选调整尺寸。

- `input_path` (string, required): 源图片路径
- `output_path` (string, optional): 输出路径
- `quality` (1-100, optional, default: 80): 压缩质量
- `format` (`jpeg|png|webp|avif|tiff|heif|gif`, optional): 输出格式
- `width` / `height` (int, optional): resize 尺寸
- `fit` (`cover|contain|fill|inside|outside`, optional): resize 策略

### 2) `image_convert`

图片格式转换。

- `input_path` (string, required): 源图片路径
- `output_format` (`jpeg|png|webp|avif|tiff|heif|gif`, required): 目标格式
- `output_path` (string, optional): 输出路径
- `quality` (1-100, optional, default: 85): 编码质量

### 3) `s3_upload`

上传本地文件到 S3 或兼容 S3 的对象存储。

- `file_path` (string, required): 本地文件路径
- `bucket` (string, required): 桶名
- `key` (string, required): 对象 key
- `region` (string, optional): 默认 `AWS_REGION` 或 `us-east-1`
- `endpoint` (url, optional): S3 兼容存储 endpoint（如 MinIO/R2）
- `force_path_style` (boolean, optional): 是否使用 path-style
- `content_type` (string, optional): 显式 Content-Type
- `metadata` (record<string,string>, optional): 对象元数据

## 本地开发

```bash
npm install
npm run check
npm test
npm run build
npm start
```

`npm start` 后服务监听 `stdio`，供 MCP Client 拉起。

说明：

- `npm run build` 会先 `tsc`，再对 `dist/**/*.js` 全量做压缩与丑化（`terser --compress --mangle`）。
- `npm run ci` 会执行 `check + coverage + build`，与 CI 保持一致。

## 用户安装与运行（推荐）

发布 npm 后，用户可直接：

```bash
npx -y mcell-mcp-server
```

## MCP 集成示例

不同 agent 的配置文件格式不同，但核心都是配置 `command + args`。

### Codex（TOML 示例）

```toml
[mcp_servers.mcell]
command = "npx"
args = ["-y", "mcell-mcp-server"]

[mcp_servers.mcell.env]
AWS_REGION = "us-east-1"
```

### Claude 系（JSON 片段示例）

```json
{
  "mcpServers": {
    "mcell": {
      "command": "npx",
      "args": ["-y", "mcell-mcp-server"],
      "env": {
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

### memo code / 其他 agent

填写同样的进程启动参数即可：

- `command`: `npx`
- `args`: `["-y", "mcell-mcp-server"]`

## S3 凭证

使用 AWS SDK 默认凭证链，建议通过环境变量注入：

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`（可选）
- `AWS_REGION`（可选）

## 发布建议

### 手动发布

1. 更新 `package.json` 的 `version`
2. 确认 `bin` 指向 `dist/index.js`
3. `npm run ci`
4. `npm publish --access public --provenance`

### 自动发布（GitHub Actions）

仓库包含两个 workflow：

- `.github/workflows/ci.yml`
  - `push/pull_request` 触发
  - 运行 `npm ci`、`npm run check`、`npm run test:coverage`、`npm run build`
- `.github/workflows/publish.yml`
  - `main` 分支 `package.json` 变化时触发
  - 只有当 `version` 与上一个 commit 不同时才会发布
  - 若 npm 上已存在该版本则跳过发布

需要在 GitHub 仓库 Secrets 中配置：

- `NPM_TOKEN`: npm publish token

发布后用户端基本只需 `npx -y mcell-mcp-server` 即可接入。
