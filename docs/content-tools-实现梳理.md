# Content Tools 功能实现梳理

本文基于当前仓库代码，回答两个问题：

1. `mcp server` 的 content 功能是如何实现的？
2. content 的数据源从哪里来？

## 1. 总体架构与调用链

入口在 `src/index.ts`：

- 服务启动时调用 `loadContentConfig()` 读取内容配置。
- 使用配置创建 `new ContentDatasetClient(...)`。
- `registerTools(...)` 时把 `contentClient` 注入到各个 content tool。

相关注册在 `src/tools/index.ts`，共四个内容工具：

- `content_latest`
- `content_list`
- `content_read`
- `content_search`

可以理解为：

`MCP Tool Handler (src/tools/content-*.ts)`
→ `ContentBlogClient 接口`
→ `ContentDatasetClient (src/lib/content/client.ts)`
→ `远端 JSON + 本地缓存（内存/磁盘）`

## 2. 四个 content 工具如何实现

### 2.1 `content_latest`

文件：`src/tools/content-latest.ts`

- 入参：`count`（默认 1，最大 20）
- 调用：`contentClient.listLatestBlogs(count)`
- 输出：
  - `structuredContent.entries`（结构化）
  - `content[].text`（格式化文本）

### 2.2 `content_list`

文件：`src/tools/content-list.ts`

- 入参：`count`（默认 20）、`offset`（默认 0）
- 调用：`contentClient.listBlogs(count, offset)`
- 输出：分页列表与 `total`

### 2.3 `content_read`

文件：`src/tools/content-read.ts`

- 入参：`id` / `slug`（二选一至少一个）、`max_chars`（默认 12000）
- 调用：
  - 有 `id` 时：`getBlogDocumentById(id)`
  - 否则：`getBlogDocumentBySlug(slug)`
- 文本输出会按 `max_chars` 截断，并在末尾追加 `[truncated]`（实现见 `src/lib/content/format.ts`）

### 2.4 `content_search`

文件：`src/tools/content-search.ts`

- 入参：`query`（必填）、`count`（默认 10，最大 30）
- 调用：`contentClient.searchBlogs(query, count)`
- 搜索打分规则（在 `src/lib/content/client.ts`）：
  - title 命中 +3
  - slug 命中 +2
  - description 命中 +1
  - 再按时间/排序字段做二级排序

## 3. 数据源从哪里来

核心在 `src/lib/content/config.ts` 与 `src/lib/content/client.ts`。

### 3.1 默认远端数据源

默认索引地址：

- `https://stack.mcell.top/mcp/index.json`

可通过环境变量覆盖：

- `MCELL_CONTENT_INDEX_URL`

`index.json` 里每条 entry 带有 `document` 字段（文档路径/URL），客户端会再请求对应文档 JSON。

### 3.2 索引与文档数据结构

定义在 `src/lib/content/types.ts`：

- 索引：`DatasetIndex`
  - `generatedAt`
  - `entries[]`
- 条目：`DatasetEntry`
  - `id/type/slug/title/url/document/...`
- 文档：`DatasetDocument`
  - 在条目字段基础上增加 `sourcePath/metadata/content`

注意：业务上只处理 `type === 'blog'` 的条目。

### 3.3 缓存与容错策略（远端优先，本地兜底）

`ContentDatasetClient` 同时使用两级缓存：

1. **内存缓存**
   - 进程内保存 index/document
   - 未过 TTL 时直接返回

2. **磁盘缓存**（默认目录 `~/.cache/mcell-mcp/content`）
   - `index.json`
   - `documents/<id_sanitized>.json`

TTL 相关环境变量：

- `MCELL_CONTENT_CACHE_DIR`
- `MCELL_CONTENT_CACHE_TTL_SECONDS`（默认 1800 秒）
- `MCELL_CONTENT_REQUEST_TIMEOUT_SECONDS`（默认 20 秒）

容错逻辑：

- 远端请求成功：更新磁盘缓存 + 内存缓存。
- 远端请求失败但本地有缓存：回退使用磁盘缓存（即便是 stale）。
- 本地也没有可用缓存：抛错返回。

## 4. 排序与筛选规则

在 `compareEntries`（`src/lib/content/client.ts`）中：

1. 优先按 `date` 倒序（新到旧）
2. 没有可比较日期时，按 `order` 升序
3. 都没有时，按 `title` 字典序

并且列表/搜索前会先过滤 `type === 'blog'`。

## 5. 结论（简版）

- content tools 是一层 MCP 工具封装，实际数据访问由 `ContentDatasetClient` 统一实现。
- 数据源默认来自 `https://stack.mcell.top/mcp/index.json`，再按 `document` 字段拉取正文 JSON。
- 实现采用“远端优先 + 本地缓存兜底 + 内存缓存加速”，保证可用性与响应速度。
- 若要切换数据源，只需配置 `MCELL_CONTENT_INDEX_URL`（并可配套调整缓存目录、TTL、超时）。
