import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeClient } from '../runtime-client'
import { TERMINAL_PROMPT_DELIVERY_RUNTIME_CAPABILITY } from '../../shared/protocol-version'
import { TERMINAL_HANDLERS } from './terminal'

const ORIGINAL_EXIT_CODE = process.exitCode

describe('terminal send default prompt observation', () => {
  const promptClient = (call: ReturnType<typeof vi.fn>, supported: boolean) =>
    ({
      call,
      getCliStatus: vi.fn().mockResolvedValue({
        result: {
          runtime: {
            reachable: true,
            runtimeId: 'runtime-current',
            capabilities: supported ? [TERMINAL_PROMPT_DELIVERY_RUNTIME_CAPABILITY] : []
          }
        }
      })
    }) as unknown as RuntimeClient

  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = ORIGINAL_EXIT_CODE
  })

  const receipt = (
    stages: string[],
    provider: string,
    observation: string
  ): { result: { send: unknown } } => ({
    result: {
      send: {
        handle: 'term-1',
        accepted: true,
        bytesWritten: 7,
        prompt: {
          requestId: '11111111-1111-4111-8111-111111111111',
          stages,
          provider,
          observation,
          processIncarnation: 'inc-1',
          generation: 1,
          baselineWorkingSequence: 0
        }
      }
    }
  })
  const send = async (
    extra: [string, string | true][],
    response: unknown,
    supported = true
  ): Promise<ReturnType<typeof vi.fn>> => {
    const call = vi.fn().mockResolvedValue(response)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    process.exitCode = undefined
    await TERMINAL_HANDLERS['terminal send']({
      flags: new Map<string, string | true>([
        ['terminal', 'term-1'],
        ['text', 'review'],
        ['enter', true],
        ...extra
      ]),
      client: promptClient(call, supported),
      cwd: '/tmp/worktree',
      json: true
    })
    return call
  }

  it('lets --wait-submit 0 opt out of the default observation', async () => {
    const call = await send(
      [['wait-submit', '0']],
      receipt(['input_accepted'], 'claude', 'supported')
    )
    expect(call.mock.calls[0]?.[1]).not.toHaveProperty('waitSubmitMs')
    expect(call.mock.calls[0]?.[2]).toEqual({
      terminalPromptPreflight: { runtimeId: 'runtime-current' }
    })
    expect(process.exitCode).toBeUndefined()
  })

  it('keeps a legacy host send unobserved and unrefused', async () => {
    const call = await send([], { result: { send: { handle: 'term-1', accepted: true } } }, false)
    expect(call.mock.calls[0]?.[1]).not.toHaveProperty('waitSubmitMs')
    expect(call.mock.calls[0]?.[2]).toEqual({ legacyTerminalPrompt: true })
    expect(process.exitCode).toBeUndefined()
  })

  it('accepts --wait-submit 0 on a legacy host', async () => {
    const call = await send(
      [['wait-submit', '0']],
      { result: { send: { handle: 'term-1', accepted: true } } },
      false
    )
    expect(call.mock.calls[0]?.[2]).toEqual({ legacyTerminalPrompt: true })
  })

  it('observes by default when replaying a retry request, without a new send', async () => {
    const call = await send(
      [['retry-request', '11111111-1111-4111-8111-111111111111']],
      receipt(['input_accepted', 'turn_started'], 'claude', 'supported')
    )
    expect(call).toHaveBeenCalledWith(
      'terminal.send',
      expect.objectContaining({ waitSubmitMs: 10_000 }),
      expect.objectContaining({
        orchestrationRequestId: '11111111-1111-4111-8111-111111111111',
        timeoutMs: 20_000
      })
    )
  })

  it.each([
    [['text-only'], 'no Enter'],
    [['interrupt'], 'interrupt']
  ])('does not add a wait to a non-prompt send (%s)', async (kind) => {
    const call = vi
      .fn()
      .mockResolvedValue({ result: { send: { handle: 'term-1', accepted: true } } })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const flags = new Map<string, string | true>([['terminal', 'term-1']])
    if (kind[0] === 'text-only') {
      flags.set('text', 'x')
    } else {
      flags.set('interrupt', true)
    }
    await TERMINAL_HANDLERS['terminal send']({
      flags,
      client: promptClient(call, true),
      cwd: '/tmp/worktree',
      json: true
    })
    expect(call.mock.calls[0]?.[1]).not.toHaveProperty('waitSubmitMs')
    expect(call.mock.calls[0]?.[1]).not.toHaveProperty('agentPrompt')
  })

  it('rejects --wait-submit 0 on a non-prompt send', async () => {
    const call = vi.fn()
    await expect(
      TERMINAL_HANDLERS['terminal send']({
        flags: new Map<string, string | true>([
          ['terminal', 'term-1'],
          ['text', 'x'],
          ['wait-submit', '0']
        ]),
        client: promptClient(call, true),
        cwd: '/tmp/worktree',
        json: true
      })
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(call).not.toHaveBeenCalled()
  })

  it.each([
    ['claude', 'supported', ['input_accepted'], 75],
    ['codex', 'permission', ['input_accepted'], 75],
    ['claude', 'incarnation_replaced', ['input_accepted'], 75],
    ['claude', 'supported', ['input_accepted', 'turn_started'], undefined],
    ['unsupported', 'unsupported', ['input_accepted'], undefined],
    ['old-host', 'unsupported', ['input_accepted'], undefined],
    ['claude', 'unsupported', ['input_accepted'], undefined]
  ])(
    'sets exit code for provider %s / %s / %j',
    async (provider, observation, stages, exitCode) => {
      await send([], receipt(stages, provider, observation))
      expect(process.exitCode).toBe(exitCode)
    }
  )

  it('does not fail an explicit --wait-submit 0 send that has not started yet', async () => {
    await send([['wait-submit', '0']], receipt(['input_accepted'], 'claude', 'supported'))
    expect(process.exitCode).toBeUndefined()
  })

  it('keeps exit code 1 for a refused send', async () => {
    await send([], { result: { send: { handle: 'term-1', accepted: false, bytesWritten: 0 } } })
    expect(process.exitCode).toBe(1)
  })
})
