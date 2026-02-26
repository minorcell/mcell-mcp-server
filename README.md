# mcell-mcp-server

`mcell-mcp-server` 是一个基于 `stdio` 的 MCP Server，定位为 mcell 常用工具合集。当前内置：

1. 内容工具（博客）：最新、列表、读取、搜索
2. 图片处理：压缩（可选 resize）、格式转换
3. S3 对象存储上传

## 代码结构

- `src/tools/*.ts`: 每个工具文件包含工具定义（schema/description）和工具实现（handler）。
- `src/index.ts`: 创建 MCP server、集中注册工具并作为 stdio 入口。

## 工具列表

### 1) `content_latest`

读取最新博客列表（按时间倒序）。

- `count` (1-20, optional, default: 1): 返回条数

### 2) `content_list`

博客分页列表（按时间倒序）。

- `count` (1-100, optional, default: 20): 每页条数
- `offset` (0-10000, optional, default: 0): 偏移量

### 3) `content_read`

读取某篇博客正文（仅 blog）。

- `id` (string, optional): 博客 ID
- `slug` (string, optional): 博客 slug
- `max_chars` (200-50000, optional, default: 12000): 最大正文字符数

约束：`id` 和 `slug` 至少传一个；如果都传，优先 `id`。

### 4) `content_search`

搜索博客（title / slug / description）。

- `query` (string, required): 搜索词
- `count` (1-30, optional, default: 10): 最大返回数量

### 5) `image_compress`

压缩图片，可选调整尺寸。

- `input_path` (string, required): 源图片路径
- `output_path` (string, optional): 输出路径
- `quality` (1-100, optional, default: 80): 压缩质量
- `format` (`jpeg|png|webp|avif|tiff|heif|gif`, optional): 输出格式
- `width` / `height` (int, optional): resize 尺寸
- `fit` (`cover|contain|fill|inside|outside`, optional): resize 策略

### 6) `image_convert`

图片格式转换。

- `input_path` (string, required): 源图片路径
- `output_format` (`jpeg|png|webp|avif|tiff|heif|gif`, required): 目标格式
- `output_path` (string, optional): 输出路径
- `quality` (1-100, optional, default: 85): 编码质量

### 7) `s3_upload`

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
npm run lint
npm run format:check
npm run check
npm test
npm run build
npm start
```

`npm start` 后服务监听 `stdio`，供 MCP Client 拉起。

说明：

- `npm run build` 会使用 `esbuild` 直接产出单一 bundle：`dist/index.js`（已压缩）。
- `npm run ci` 会执行 `lint + format:check + check + coverage + build`，与 CI 保持一致。

## 用户安装与运行（推荐）

发布 npm 后，用户可直接：

```bash
npx -y @mcell/mcell-mcp-server
```

## MCP 集成示例

不同 agent 的配置文件格式不同，但核心都是配置 `command + args`。

### Codex（TOML 示例）

```toml
[mcp_servers.mcell]
command = "npx"
args = ["-y", "@mcell/mcell-mcp-server"]

[mcp_servers.mcell.env]
AWS_REGION = "us-east-1"
```

### Claude 系（JSON 片段示例）

```json
{
  "mcpServers": {
    "mcell": {
      "command": "npx",
      "args": ["-y", "@mcell/mcell-mcp-server"],
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
- `args`: `["-y", "@mcell/mcell-mcp-server"]`

## S3 凭证

使用 AWS SDK 默认凭证链，建议通过环境变量注入：

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`（可选）
- `AWS_REGION`（可选）

## 内容数据源配置（博客）

内容工具采用“远端优先 + 本地缓存兜底”，并且只处理 blog 类型条目。

- `MCELL_CONTENT_INDEX_URL`
  - 默认：`https://stack.mcell.top/mcp/index.json`
- `MCELL_CONTENT_CACHE_DIR`
  - 默认：`~/.cache/mcell-mcp/content`
- `MCELL_CONTENT_CACHE_TTL_SECONDS`
  - 默认：`1800`
- `MCELL_CONTENT_REQUEST_TIMEOUT_SECONDS`
  - 默认：`20`

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

发布后用户端基本只需 `npx -y @mcell/mcell-mcp-server` 即可接入。
