import notifier from 'node-notifier'
import { describe, expect, it, vi } from 'vitest'
import { createNotificationService } from '../src/lib/notify.js'

function makeJsonResponse(status = 200): Response {
  return new Response('{}', {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

describe('notification service', () => {
  it('defaults to system target when target is omitted', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const fetchMock = vi.fn(async () => makeJsonResponse())
    const service = createNotificationService({
      notifySystemFn,
      fetchFn: fetchMock as unknown as typeof fetch,
      env: {}
    })

    const result = await service.notifyTaskComplete({
      task_name: 'Long running task'
    })

    expect(result.ok).toBe(true)
    expect(result.total).toBe(1)
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.results).toEqual([{ target: 'system', channel: 'system', ok: true }])
    expect(notifySystemFn).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends to system and configured feishu webhook', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const fetchMock = vi.fn(async () => makeJsonResponse())
    const service = createNotificationService({
      notifySystemFn,
      fetchFn: fetchMock as unknown as typeof fetch,
      env: {
        MCELL_NOTIFY_WEBHOOK_FEISHU: 'https://hooks.example.com/notify?token=secret'
      }
    })

    const result = await service.notifyTaskComplete({
      task_name: 'Build release',
      summary: 'All steps completed',
      duration_sec: 95,
      target: ['system', 'feishu']
    })

    expect(result.ok).toBe(true)
    expect(result.total).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.results).toEqual([
      { target: 'system', channel: 'system', ok: true },
      {
        target: 'feishu',
        channel: 'webhook',
        ok: true,
        endpoint: 'https://hooks.example.com/notify?[REDACTED]',
        status_code: 200
      }
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://hooks.example.com/notify?token=secret')
    expect(init.method).toBe('POST')
    const payload = JSON.parse(String(init.body)) as { msg_type: string; content: { text: string } }
    expect(payload.msg_type).toBe('text')
    expect(payload.content.text).toContain('Task completed: Build release')
  })

  it('returns all target results when one target fails', async () => {
    const notifySystemFn = vi.fn(async () => {
      throw new Error('system notifier failed')
    })
    const fetchMock = vi.fn(async () => makeJsonResponse())
    const service = createNotificationService({
      notifySystemFn,
      fetchFn: fetchMock as unknown as typeof fetch,
      env: {
        MCELL_NOTIFY_WEBHOOK_FEISHU: 'https://hooks.example.com/notify'
      }
    })

    const result = await service.notifyTaskComplete({
      task_name: 'Nightly cleanup',
      target: ['system', 'feishu']
    })

    expect(result.ok).toBe(false)
    expect(result.total).toBe(2)
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'system', channel: 'system', ok: false }),
        expect.objectContaining({ target: 'feishu', channel: 'webhook', ok: true })
      ])
    )
  })

  it('supports wechat alias and per-target payload override', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const fetchMock = vi.fn(async () => makeJsonResponse())
    const service = createNotificationService({
      notifySystemFn,
      fetchFn: fetchMock as unknown as typeof fetch,
      env: {
        MCELL_NOTIFY_WEBHOOK_WECOM: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc'
      }
    })

    const overridePayload = {
      msgtype: 'markdown',
      markdown: {
        content: 'override body'
      }
    }

    const result = await service.notifyTaskComplete({
      task_name: 'Sync docs',
      target: ['wechat'],
      webhook_payloads: {
        wechat: overridePayload
      }
    })

    expect(result.ok).toBe(true)
    expect(result.results).toEqual([
      {
        target: 'wecom',
        channel: 'webhook',
        ok: true,
        endpoint: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?[REDACTED]',
        status_code: 200
      }
    ])

    const call = fetchMock.mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(String(call[1].body))
    expect(payload).toEqual(overridePayload)
  })

  it('redacts webhook url and reports status code on non-2xx response', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const fetchMock = vi.fn(async () => makeJsonResponse(500))
    const service = createNotificationService({
      notifySystemFn,
      fetchFn: fetchMock as unknown as typeof fetch,
      env: {
        MCELL_NOTIFY_WEBHOOK_FEISHU: 'https://hooks.example.com/fail?token=secret'
      }
    })

    const result = await service.notifyTaskComplete({
      task_name: 'Deploy',
      target: ['feishu']
    })

    expect(result.ok).toBe(false)
    expect(result.failed).toBe(1)
    expect(result.results).toEqual([
      {
        target: 'feishu',
        channel: 'webhook',
        ok: false,
        endpoint: 'https://hooks.example.com/fail?[REDACTED]',
        status_code: 500,
        error: 'Webhook request failed (500).'
      }
    ])
  })

  it('supports failed and cancelled status titles', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const service = createNotificationService({
      notifySystemFn,
      env: {}
    })

    const failed = await service.notifyTaskComplete({
      task_name: 'Job A',
      status: 'failed',
      target: ['system']
    })
    const cancelled = await service.notifyTaskComplete({
      task_name: 'Job B',
      status: 'cancelled',
      target: ['system']
    })

    expect(failed.title).toBe('Task failed: Job A')
    expect(cancelled.title).toBe('Task cancelled: Job B')
  })

  it('throws for invalid input values', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const service = createNotificationService({
      notifySystemFn,
      env: {}
    })

    await expect(service.notifyTaskComplete({ task_name: '   ' })).rejects.toThrow('task_name cannot be empty')
    await expect(service.notifyTaskComplete({ task_name: 'x', duration_sec: -1 })).rejects.toThrow(
      'duration_sec must be >= 0'
    )
    await expect(service.notifyTaskComplete({ task_name: 'x', webhook_timeout_ms: 0 })).rejects.toThrow(
      'webhook_timeout_ms must be a positive integer'
    )
    await expect(service.notifyTaskComplete({ task_name: 'x', target: ['   '] })).rejects.toThrow(
      'Notification target cannot be empty'
    )
  })

  it('throws for invalid webhook env configuration', async () => {
    expect(() =>
      createNotificationService({
        env: {
          MCELL_NOTIFY_WEBHOOK_TIMEOUT_MS: '0'
        }
      })
    ).toThrow('MCELL_NOTIFY_WEBHOOK_TIMEOUT_MS must be a positive integer')

    expect(() =>
      createNotificationService({
        env: {
          MCELL_NOTIFY_WEBHOOK_: 'https://hooks.example.com'
        }
      })
    ).toThrow('MCELL_NOTIFY_WEBHOOK_ must include a non-empty alias suffix')

    expect(() =>
      createNotificationService({
        env: {
          MCELL_NOTIFY_WEBHOOK_SYSTEM: 'https://hooks.example.com'
        }
      })
    ).toThrow('cannot use "system" as a webhook alias')

    expect(() =>
      createNotificationService({
        env: {
          MCELL_NOTIFY_WEBHOOK_FEISHU: 'not-a-url'
        }
      })
    ).toThrow('MCELL_NOTIFY_WEBHOOK_FEISHU must be a valid URL')
  })

  it('uses default node-notifier sender when notifySystemFn is omitted', async () => {
    const notifySpy = vi.spyOn(notifier, 'notify').mockImplementation((notification, callback) => {
      callback?.(null, 'ok')
      return notifier as unknown as typeof notifier.NotificationCenter
    })
    const service = createNotificationService({
      env: {}
    })

    const result = await service.notifyTaskComplete({
      task_name: 'default notifier',
      target: ['system']
    })

    expect(result.ok).toBe(true)
    expect(notifySpy).toHaveBeenCalledTimes(1)
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Task completed: default notifier' }),
      expect.any(Function)
    )
  })

  it('reports system notification failure from default node-notifier sender', async () => {
    vi.spyOn(notifier, 'notify').mockImplementation((_notification, callback) => {
      callback?.(new Error('native notifier failed'), '')
      return notifier as unknown as typeof notifier.NotificationCenter
    })
    const service = createNotificationService({
      env: {}
    })

    const result = await service.notifyTaskComplete({
      task_name: 'default notifier fail',
      target: ['system']
    })

    expect(result.ok).toBe(false)
    expect(result.results[0].error).toContain('native notifier failed')
  })

  it('uses wecom payload template without override', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const fetchMock = vi.fn(async () => makeJsonResponse())
    const service = createNotificationService({
      notifySystemFn,
      fetchFn: fetchMock as unknown as typeof fetch,
      env: {
        MCELL_NOTIFY_WEBHOOK_WECOM: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc'
      }
    })

    await service.notifyTaskComplete({
      task_name: 'wecom default payload',
      target: ['wecom']
    })

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))
    expect(body.msgtype).toBe('text')
    expect(body.text.content).toContain('Task completed: wecom default payload')
  })

  it('uses default text payload for custom webhook target', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const fetchMock = vi.fn(async () => makeJsonResponse())
    const service = createNotificationService({
      notifySystemFn,
      fetchFn: fetchMock as unknown as typeof fetch,
      env: {
        MCELL_NOTIFY_WEBHOOK_CUSTOM: 'https://hooks.example.com/custom?token=1'
      }
    })

    await service.notifyTaskComplete({
      task_name: 'custom payload',
      target: ['custom']
    })

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))
    expect(body.text).toContain('Task completed: custom payload')
  })

  it('returns target not configured error for unknown webhook alias', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const service = createNotificationService({
      notifySystemFn,
      env: {}
    })

    const result = await service.notifyTaskComplete({
      task_name: 'unknown target',
      target: ['unknown']
    })

    expect(result.ok).toBe(false)
    expect(result.results[0].error).toContain('Webhook target "unknown" is not configured')
  })

  it('reports invalid webhook payload serialization errors', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const fetchMock = vi.fn(async () => makeJsonResponse())
    const service = createNotificationService({
      notifySystemFn,
      fetchFn: fetchMock as unknown as typeof fetch,
      env: {
        MCELL_NOTIFY_WEBHOOK_FEISHU: 'https://hooks.example.com/serialize'
      }
    })

    const result = await service.notifyTaskComplete({
      task_name: 'bad payload',
      target: ['feishu'],
      webhook_payloads: {
        feishu: () => 'nope'
      }
    })

    expect(result.ok).toBe(false)
    expect(result.results[0].error).toContain('Invalid webhook payload')
  })

  it('reports timeout errors for aborted webhook request', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const fetchMock = vi.fn(async () => {
      throw new DOMException('Aborted', 'AbortError')
    })
    const service = createNotificationService({
      notifySystemFn,
      fetchFn: fetchMock as unknown as typeof fetch,
      env: {
        MCELL_NOTIFY_WEBHOOK_FEISHU: 'https://hooks.example.com/timeout'
      }
    })

    const result = await service.notifyTaskComplete({
      task_name: 'timeout case',
      target: ['feishu'],
      webhook_timeout_ms: 1234
    })

    expect(result.ok).toBe(false)
    expect(result.results[0].error).toBe('Webhook request timed out after 1234ms.')
  })

  it('uses timeout from environment when webhook_timeout_ms is omitted', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const fetchMock = vi.fn(async () => {
      throw new DOMException('Aborted', 'AbortError')
    })
    const service = createNotificationService({
      notifySystemFn,
      fetchFn: fetchMock as unknown as typeof fetch,
      env: {
        MCELL_NOTIFY_WEBHOOK_TIMEOUT_MS: '2345',
        MCELL_NOTIFY_WEBHOOK_FEISHU: 'https://hooks.example.com/timeout-env'
      }
    })

    const result = await service.notifyTaskComplete({
      task_name: 'timeout from env',
      target: ['feishu']
    })

    expect(result.ok).toBe(false)
    expect(result.results[0].error).toBe('Webhook request timed out after 2345ms.')
  })

  it('handles non-standard rejection reasons via fallback result mapping', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const service = createNotificationService({
      notifySystemFn,
      env: {
        MCELL_NOTIFY_WEBHOOK_FEISHU: 'https://hooks.example.com/fallback?token=abc'
      }
    })

    ;(service as unknown as { sendWebhookNotification: () => Promise<never> }).sendWebhookNotification = async () => {
      throw 'raw failure'
    }

    const result = await service.notifyTaskComplete({
      task_name: 'fallback map',
      target: ['feishu']
    })

    expect(result.ok).toBe(false)
    expect(result.results[0]).toEqual({
      target: 'feishu',
      channel: 'webhook',
      ok: false,
      endpoint: 'https://hooks.example.com/fallback?[REDACTED]',
      error: 'raw failure'
    })
  })

  it('redacts invalid endpoint strings as [invalid-url]', async () => {
    const notifySystemFn = vi.fn(async () => {})
    const service = createNotificationService({
      notifySystemFn,
      env: {
        MCELL_NOTIFY_WEBHOOK_FEISHU: 'https://hooks.example.com/ok'
      }
    })

    ;(service as unknown as { webhookEndpoints: Map<string, string> }).webhookEndpoints.set('feishu', '%%%')
    ;(service as unknown as { sendWebhookNotification: () => Promise<never> }).sendWebhookNotification = async () => {
      throw 'raw failure'
    }

    const result = await service.notifyTaskComplete({
      task_name: 'invalid url redaction',
      target: ['feishu']
    })

    expect(result.ok).toBe(false)
    expect(result.results[0].endpoint).toBe('[invalid-url]')
  })
})
