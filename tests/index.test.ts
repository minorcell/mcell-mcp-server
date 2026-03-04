import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleFatalError, isExecutedAsEntrypoint, main, runEntrypointIfNeeded } from '../src/index.js'

describe('index entrypoint helpers', () => {
  const originalArgv = [...process.argv]

  afterEach(() => {
    process.argv = [...originalArgv]
    vi.restoreAllMocks()
  })

  it('returns false when argv[1] is missing', () => {
    process.argv = [process.argv[0]]
    expect(isExecutedAsEntrypoint()).toBe(false)
  })

  it('returns false when argv[1] does not match module path', () => {
    process.argv[1] = path.join(process.cwd(), 'not-index.ts')
    expect(isExecutedAsEntrypoint()).toBe(false)
  })

  it('returns true when argv[1] matches this module path', () => {
    process.argv[1] = path.resolve('src/index.ts')
    expect(isExecutedAsEntrypoint()).toBe(true)
  })

  it('runs main and connects server transport', async () => {
    const connectSpy = vi.spyOn(McpServer.prototype, 'connect').mockResolvedValue()
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main()

    expect(connectSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('[mcell-mcp-server] running on stdio')
  })

  it('runs injected entrypoint function when executed as entrypoint', async () => {
    process.argv[1] = path.resolve('src/index.ts')
    const runMain = vi.fn(async () => {})

    runEntrypointIfNeeded(runMain)
    await Promise.resolve()

    expect(runMain).toHaveBeenCalledTimes(1)
  })

  it('does not run injected entrypoint function when not executed as entrypoint', async () => {
    process.argv[1] = path.join(process.cwd(), 'not-entrypoint.ts')
    const runMain = vi.fn(async () => {})

    runEntrypointIfNeeded(runMain)
    await Promise.resolve()

    expect(runMain).not.toHaveBeenCalled()
  })

  it('handles fatal errors by logging and exiting', () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new Error(`exit:${code ?? ''}`)
    }) as never)

    expect(() => handleFatalError(new Error('boom'))).toThrow('exit:1')
    expect(logSpy).toHaveBeenCalledWith('[mcell-mcp-server] fatal:', expect.any(Error))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
