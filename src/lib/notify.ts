import notifier from 'node-notifier'

const WEBHOOK_ENV_PREFIX = 'MCELL_NOTIFY_WEBHOOK_'
const WEBHOOK_TIMEOUT_ENV = 'MCELL_NOTIFY_WEBHOOK_TIMEOUT_MS'
const DEFAULT_WEBHOOK_TIMEOUT_MS = 10_000

export type NotifyTaskStatus = 'success' | 'failed' | 'cancelled'
export type NotifyChannel = 'system' | 'webhook'

export interface NotifyTaskCompleteInput {
  task_name: string
  status?: NotifyTaskStatus
  summary?: string
  duration_sec?: number
  target?: string[]
  webhook_payloads?: Record<string, unknown>
  webhook_timeout_ms?: number
}

export interface NotifyTargetResult {
  target: string
  channel: NotifyChannel
  ok: boolean
  endpoint?: string
  status_code?: number
  error?: string
}

export interface NotifyTaskCompleteResult {
  ok: boolean
  task_name: string
  status: NotifyTaskStatus
  title: string
  message: string
  total: number
  succeeded: number
  failed: number
  results: NotifyTargetResult[]
}

export interface NotificationService {
  notifyTaskComplete(input: NotifyTaskCompleteInput): Promise<NotifyTaskCompleteResult>
}

export interface CreateNotificationServiceDeps {
  fetchFn?: typeof fetch
  notifySystemFn?: (title: string, message: string) => Promise<void>
  env?: NodeJS.ProcessEnv
}

interface NotifyTarget {
  target: string
  channel: NotifyChannel
}

class NotifyDispatchError extends Error {
  constructor(public readonly result: NotifyTargetResult) {
    super(result.error ?? `Notification failed for target "${result.target}".`)
    this.name = 'NotifyDispatchError'
  }
}

function normalizeTargetAlias(raw: string): string {
  const value = raw.trim().toLowerCase()
  if (!value) {
    throw new Error('Notification target cannot be empty.')
  }
  if (value === 'wechat') return 'wecom'
  return value
}

function parsePositiveInt(raw: string | undefined, fallback: number, envName: string): number {
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive integer`)
  }
  return parsed
}

function parseWebhookTimeout(raw: number | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  if (!Number.isInteger(raw) || raw <= 0) {
    throw new Error('webhook_timeout_ms must be a positive integer.')
  }
  return raw
}

function buildNotificationTitle(taskName: string, status: NotifyTaskStatus): string {
  switch (status) {
    case 'success':
      return `Task completed: ${taskName}`
    case 'failed':
      return `Task failed: ${taskName}`
    case 'cancelled':
      return `Task cancelled: ${taskName}`
  }
}

function buildNotificationMessage(status: NotifyTaskStatus, summary?: string, durationSec?: number): string {
  const parts: string[] = []
  if (summary && summary.trim()) {
    parts.push(summary.trim())
  }
  parts.push(`status=${status}`)
  if (durationSec !== undefined) {
    parts.push(`duration=${durationSec}s`)
  }
  return parts.join(' | ')
}

function buildWebhookPayload(target: string, text: string, overridePayload: unknown): unknown {
  if (overridePayload !== undefined) {
    return overridePayload
  }

  if (target === 'feishu') {
    return {
      msg_type: 'text',
      content: {
        text
      }
    }
  }
  if (target === 'wecom') {
    return {
      msgtype: 'text',
      text: {
        content: text
      }
    }
  }
  return { text }
}

function redactEndpoint(url: string): string {
  try {
    const parsed = new URL(url)
    const query = parsed.search ? '?[REDACTED]' : ''
    const hash = parsed.hash ? '#[REDACTED]' : ''
    return `${parsed.origin}${parsed.pathname}${query}${hash}`
  } catch {
    return '[invalid-url]'
  }
}

function loadWebhookEndpoints(env: NodeJS.ProcessEnv): Map<string, string> {
  const endpoints = new Map<string, string>()

  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(WEBHOOK_ENV_PREFIX)) continue
    if (typeof value !== 'string') continue

    const rawAlias = key.slice(WEBHOOK_ENV_PREFIX.length).trim().toLowerCase()
    if (!rawAlias) {
      throw new Error(`${key} must include a non-empty alias suffix.`)
    }

    const canonicalAlias = normalizeTargetAlias(rawAlias)
    if (canonicalAlias === 'system') {
      throw new Error(`${key} cannot use "system" as a webhook alias.`)
    }

    const endpoint = value.trim()
    if (!endpoint) continue
    try {
      new URL(endpoint)
    } catch {
      throw new Error(`${key} must be a valid URL.`)
    }

    // Canonical alias key (for example, wechat -> wecom) should prefer direct canonical declaration.
    const hasExisting = endpoints.has(canonicalAlias)
    const isDirectCanonical = rawAlias === canonicalAlias
    if (!hasExisting || isDirectCanonical) {
      endpoints.set(canonicalAlias, endpoint)
    }
  }

  return endpoints
}

function resolveTargets(targets: string[] | undefined): NotifyTarget[] {
  const rawTargets = targets && targets.length > 0 ? targets : ['system']
  const results: NotifyTarget[] = []
  const seen = new Set<string>()

  for (const rawTarget of rawTargets) {
    const target = normalizeTargetAlias(rawTarget)
    const channel: NotifyChannel = target === 'system' ? 'system' : 'webhook'
    const dedupeKey = `${channel}:${target}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    results.push({ target, channel })
  }

  return results
}

function normalizeWebhookPayloadOverrides(payloads: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!payloads) return {}

  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payloads)) {
    const alias = normalizeTargetAlias(key)
    normalized[alias] = value
  }
  return normalized
}

function createNodeNotifierSender(): (title: string, message: string) => Promise<void> {
  return async (title, message) =>
    await new Promise<void>((resolve, reject) => {
      notifier.notify({ title, message, wait: false }, (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
}

class DefaultNotificationService implements NotificationService {
  private readonly fetchFn: typeof fetch
  private readonly notifySystemFn: (title: string, message: string) => Promise<void>
  private readonly webhookEndpoints: Map<string, string>
  private readonly defaultWebhookTimeoutMs: number

  constructor(deps: CreateNotificationServiceDeps = {}) {
    const env = deps.env ?? process.env
    this.fetchFn = deps.fetchFn ?? fetch
    this.notifySystemFn = deps.notifySystemFn ?? createNodeNotifierSender()
    this.webhookEndpoints = loadWebhookEndpoints(env)
    this.defaultWebhookTimeoutMs = parsePositiveInt(
      env[WEBHOOK_TIMEOUT_ENV],
      DEFAULT_WEBHOOK_TIMEOUT_MS,
      WEBHOOK_TIMEOUT_ENV
    )
  }

  async notifyTaskComplete(input: NotifyTaskCompleteInput): Promise<NotifyTaskCompleteResult> {
    const taskName = input.task_name.trim()
    if (!taskName) {
      throw new Error('task_name cannot be empty.')
    }
    if (input.duration_sec !== undefined && (Number.isNaN(input.duration_sec) || input.duration_sec < 0)) {
      throw new Error('duration_sec must be >= 0.')
    }

    const status: NotifyTaskStatus = input.status ?? 'success'
    const title = buildNotificationTitle(taskName, status)
    const message = buildNotificationMessage(status, input.summary, input.duration_sec)
    const webhookTimeoutMs = parseWebhookTimeout(input.webhook_timeout_ms, this.defaultWebhookTimeoutMs)
    const targets = resolveTargets(input.target)
    const payloadOverrides = normalizeWebhookPayloadOverrides(input.webhook_payloads)

    const settledResults = await Promise.allSettled(
      targets.map(async ({ target, channel }) => {
        if (channel === 'system') {
          try {
            await this.notifySystemFn(title, message)
            return { target, channel, ok: true } satisfies NotifyTargetResult
          } catch (error) {
            throw new NotifyDispatchError({
              target,
              channel,
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }

        return await this.sendWebhookNotification({
          target,
          title,
          message,
          timeoutMs: webhookTimeoutMs,
          payloadOverride: payloadOverrides[target]
        })
      })
    )

    const results = settledResults.map((item, index) => {
      if (item.status === 'fulfilled') return item.value
      const fallbackTarget = targets[index]
      const reason = item.reason

      if (reason instanceof NotifyDispatchError) {
        return reason.result
      }

      const fallbackResult: NotifyTargetResult = {
        target: fallbackTarget.target,
        channel: fallbackTarget.channel,
        ok: false,
        error: reason instanceof Error ? reason.message : String(reason)
      }
      if (fallbackTarget.channel === 'webhook') {
        const endpoint = this.webhookEndpoints.get(fallbackTarget.target)
        if (endpoint) {
          fallbackResult.endpoint = redactEndpoint(endpoint)
        }
      }
      return fallbackResult
    })

    const failed = results.filter((result) => !result.ok).length
    return {
      ok: failed === 0,
      task_name: taskName,
      status,
      title,
      message,
      total: results.length,
      succeeded: results.length - failed,
      failed,
      results
    }
  }

  private async sendWebhookNotification(args: {
    target: string
    title: string
    message: string
    timeoutMs: number
    payloadOverride: unknown
  }): Promise<NotifyTargetResult> {
    const endpoint = this.webhookEndpoints.get(args.target)
    if (!endpoint) {
      throw new NotifyDispatchError({
        target: args.target,
        channel: 'webhook',
        ok: false,
        error: `Webhook target "${args.target}" is not configured.`
      })
    }

    const text = `${args.title}\n${args.message}`
    const payload = buildWebhookPayload(args.target, text, args.payloadOverride)
    let body: string

    try {
      const serialized = JSON.stringify(payload)
      if (!serialized) {
        throw new Error('Webhook payload cannot be empty.')
      }
      body = serialized
    } catch (error) {
      throw new NotifyDispatchError({
        target: args.target,
        channel: 'webhook',
        ok: false,
        endpoint: redactEndpoint(endpoint),
        error: `Invalid webhook payload: ${error instanceof Error ? error.message : String(error)}`
      })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), args.timeoutMs)

    try {
      const response = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': '@mcell/mcell-mcp-server'
        },
        body,
        signal: controller.signal
      })

      if (!response.ok) {
        throw new NotifyDispatchError({
          target: args.target,
          channel: 'webhook',
          ok: false,
          endpoint: redactEndpoint(endpoint),
          status_code: response.status,
          error: `Webhook request failed (${response.status}).`
        })
      }

      return {
        target: args.target,
        channel: 'webhook',
        ok: true,
        endpoint: redactEndpoint(endpoint),
        status_code: response.status
      }
    } catch (error) {
      if (error instanceof NotifyDispatchError) {
        throw error
      }

      const message =
        error instanceof DOMException && error.name === 'AbortError'
          ? `Webhook request timed out after ${args.timeoutMs}ms.`
          : error instanceof Error
            ? error.message
            : String(error)

      throw new NotifyDispatchError({
        target: args.target,
        channel: 'webhook',
        ok: false,
        endpoint: redactEndpoint(endpoint),
        error: message
      })
    } finally {
      clearTimeout(timer)
    }
  }
}

export function createNotificationService(deps: CreateNotificationServiceDeps = {}): NotificationService {
  return new DefaultNotificationService(deps)
}
