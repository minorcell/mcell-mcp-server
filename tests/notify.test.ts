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
})
