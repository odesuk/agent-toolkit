import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { HARD_PROMPT, SOFT_PROMPT, SUMMARY_KEY, WAIT, handoff } from './register'

const TURN = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

type Fork = { isAnswered: true; text: string } | { isAnswered: false; reason: 'nothing-to-fork' }

// Stands for the engine beneath the mod and records what the mod asked of it, in order.
const engine = (on: On, tokens: number, fork: Fork = { isAnswered: true, text: 'SUMMARY' }, window = 1_000_000) => {
  const seen = { calls: [] as string[], prompts: [] as string[], submitted: [] as string[], stored: [] as unknown[], toasts: [] as string[] }
  on('turn.complete', () => ({ text: 'ok' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens, window }, rateLimits: [] } }))
  on('model.fork', (_, e) => {
    seen.calls.push('fork')
    seen.prompts.push(String(e.prompt))
    return { value: { ...fork, usage: USAGE } }
  })
  on('store.set', (_, e) => {
    seen.stored.push(e)
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
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  return seen
}

const HANDOFF = ['fork', '/clear', 'submit']

test('at the soft limit and a break: summary, /clear, then the summary in the new session', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 250_000)
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.calls).toEqual(HANDOFF)
  expect(seen.prompts).toEqual([SOFT_PROMPT])
  expect(seen.submitted).toEqual([handoff('SUMMARY')])
  expect(seen.stored).toEqual([expect.objectContaining({ key: SUMMARY_KEY, value: 'SUMMARY' })])
  expect(seen.toasts[0]).toContain('new session started at 250K')
})

test('mid-task at the soft limit: the session is kept, and the next turn asks again', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 300_000, { isAnswered: true, text: ` ${WAIT}\n` })
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.calls).toEqual(['fork'])
  expect(seen.toasts).toEqual([])
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
  const seen = engine(on, 600_000, { isAnswered: true, text: WAIT })
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.calls).toEqual(['fork'])
  expect(seen.toasts[0]).toContain('session kept')
})

test('a model window under the hard limit is the hard limit', async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 400_000, undefined, 400_000)
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
  const seen = engine(on, 300_000, { isAnswered: false, reason: 'nothing-to-fork' })
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.calls).toEqual(['fork'])
  expect(seen.toasts[0]).toContain('nothing-to-fork')
})

test('options replace both limits', { options: { threshold: 100_000, max: 200_000 } }, async ($, on) => {
  const clock = mock.clock(on)
  const seen = engine(on, 200_000)
  await $.turn.complete(TURN)
  await clock.advance(1_000)
  expect(seen.prompts).toEqual([HARD_PROMPT])
})
