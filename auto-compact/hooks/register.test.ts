import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { ENABLED_KEY, HARD_PROMPT, SOFT_PROMPT, SUMMARY_KEY, USAGE_TEXT, WAIT, handoff } from './register'

const TURN = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const HANDOFF = ['fork', '/clear', 'submit']

type Fork = { isAnswered: true; text: string } | { isAnswered: false; reason: 'nothing-to-fork' }
type Opts = { fork?: Fork; window?: number; store?: Record<string, unknown>; isNotifySent?: boolean }

// Stands for the engine beneath the mod and records what the mod asked of it, in order.
const engine = (on: On, tokens: number, opts: Opts = {}) => {
  const { fork = { isAnswered: true, text: 'SUMMARY' }, window = 1_000_000, store = {}, isNotifySent = true } = opts
  const seen = {
    calls: [] as string[],
    prompts: [] as string[],
    submitted: [] as string[],
    notes: [] as string[],
    toasts: [] as string[],
    store,
  }
  on('turn.complete', () => ({ text: 'ok' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens, window }, rateLimits: [] } }))
  on('model.fork', (_, e) => {
    seen.calls.push('fork')
    seen.prompts.push(String(e.prompt))
    return { value: { ...fork, usage: USAGE } }
  })
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('command.run', (_, e) => {
    seen.calls.push(`/${e.command}`)
    return {}
  })
  on('prompt.submit', (_, e) => {
    seen.calls.push('submit')
    seen.submitted.push(e.text)
    return { text: e.text }
  })
  on('ui.notify', (_, e) => {
    seen.notes.push(e.text)
    return { value: isNotifySent ? { isSent: true, channel: 'client' } : { isSent: false, reason: 'no-surface' } }
  })
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  return seen
}

test('at the soft limit and a break: summary, /clear, the summary in the new session, a notification', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 250_000)
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.calls).toEqual(HANDOFF)
  expect(seen.prompts).toEqual([SOFT_PROMPT])
  expect(seen.submitted).toEqual([handoff('SUMMARY')])
  expect(seen.store[SUMMARY_KEY]).toBe('SUMMARY')
  expect(seen.notes).toEqual(['New session started at 250K tokens, with a handoff summary.'])
  expect(seen.toasts).toEqual([])
})

test('mid-task at the soft limit: the session is kept, and the next turn asks again', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 300_000, { fork: { isAnswered: true, text: ` ${WAIT} ` } })
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.calls).toEqual(['fork'])
  expect(seen.notes).toEqual([])
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.advance(1_000)
  expect(seen.calls).toEqual(['fork', 'fork'])
})

test('at the hard limit: hands off without asking for a break', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 500_000)
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.prompts).toEqual([HARD_PROMPT])
  expect(seen.calls).toEqual(HANDOFF)
})

test('a WAIT at the hard limit is no summary: the session is kept', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 600_000, { fork: { isAnswered: true, text: WAIT } })
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.calls).toEqual(['fork'])
  expect(seen.notes[0]).toContain('Session kept')
})

test('a model window under the hard limit is the hard limit', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 400_000, { window: 400_000 })
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.prompts).toEqual([HARD_PROMPT])
})

test('does nothing below the soft limit', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 249_999)
  await $.turn.complete(TURN)
  await clock.advance(60_000)
  expect(seen.calls).toEqual([])
})

test('ignores a subagent turn', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 600_000)
  await $.turn.complete({ ...TURN, agentId: 'a1' })
  await clock.advance(60_000)
  expect(seen.calls).toEqual([])
})

test('hands off once when two turns end before it runs', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 300_000)
  await $.turn.complete(TURN)
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.advance(1_000)
  expect(seen.calls).toEqual(HANDOFF)
})

test('without a fork answer the session is kept', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 300_000, { fork: { isAnswered: false, reason: 'nothing-to-fork' } })
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.calls).toEqual(['fork'])
  expect(seen.notes[0]).toContain('nothing-to-fork')
})

test('options replace both limits', { options: { threshold: 100_000, max: 200_000 } }, async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 200_000)
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.prompts).toEqual([HARD_PROMPT])
})

test('OFF stops the handoff, and ON brings it back', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 600_000)
  expect((await $.command.run({ command: 'auto-compact', args: 'off' })).text).toContain('is OFF')
  expect(seen.store[ENABLED_KEY]).toBe(false)
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.calls).toEqual([])
  expect((await $.command.run({ command: 'auto-compact', args: ' ON ' })).text).toContain('is ON')
  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.advance(1_000)
  expect(seen.calls).toEqual(HANDOFF)
})

test('default is ON, and the command shows the state and limits', async ($, on) => {
  engine(on, 0)
  expect((await $.command.run({ command: 'auto-compact' })).text).toBe(
    'auto-compact is ON: soft limit 250K, hard limit 500K tokens.',
  )
  expect((await $.command.run({ command: 'auto-compact', args: 'maybe' })).text).toBe(USAGE_TEXT)
})

test('OFF stored in an earlier session is kept', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 600_000, { store: { [ENABLED_KEY]: false } })
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.calls).toEqual([])
})

test('where no notification can be raised, a toast says it', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 300_000, { isNotifySent: false })
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.notes).toHaveLength(1)
  expect(seen.toasts).toEqual(['auto-compact: New session started at 300K tokens, with a handoff summary.'])
})
