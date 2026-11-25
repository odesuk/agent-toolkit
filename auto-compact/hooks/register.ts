import type { Register } from 'claude-code'

const DEFAULT_THRESHOLD = 250_000
const DEFAULT_MAX = 500_000
const DELAY_MS = 500
export const SUMMARY_KEY = 'lastSummary'
export const WAIT = 'WAIT'

const SUMMARY_ASK = [
  'Write a handoff summary for a new session that continues the same work.',
  'Include: the goal, what is done, decisions made and why, files and paths touched,',
  'commands or checks that matter, open problems, and the exact next step.',
  'Answer at once with the summary alone. You have no tools.',
].join(' ')

// Between the threshold and the max: hand off only at a natural break.
export const SOFT_PROMPT = [
  'This session\'s context is large, and it will be cleared at a natural break.',
  'If the work is in the middle of a step (an edit half done, a check not yet run,',
  `a result not yet read, a question waiting for an answer), reply with exactly ${WAIT}.`,
  'Otherwise:',
  SUMMARY_ASK,
].join(' ')

// At the max: hand off now, whatever the state.
export const HARD_PROMPT = `This session's context is full and it will be cleared now. ${SUMMARY_ASK}`

export const handoff = (summary: string) =>
  `auto-compact cleared the previous session at its context limit. Continue the work from this handoff summary:\n\n${summary}`

const positive = (value: unknown, fallback: number) =>
  typeof value === 'number' && value > 0 ? value : fallback

export const register: Register = (on, options) => {
  const threshold = positive(options.threshold, DEFAULT_THRESHOLD)
  const max = Math.max(threshold, positive(options.max, DEFAULT_MAX))
  // One handoff at a time; the new session's first turn reads its own size.
  let isPending = false

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || isPending) return done

    const { context } = await $.session.usage()
    const tokens = context.tokens ?? 0
    if (tokens < threshold) return done

    // A model window under the max makes the window the hard limit.
    const isHard = tokens >= Math.min(max, context.window)
    isPending = true
    // Runs on a timer: command.run rejects inside a hook the turn waits on.
    $.clock.after(DELAY_MS, async () => {
      try {
        const fork = await $.model.fork({ prompt: isHard ? HARD_PROMPT : SOFT_PROMPT })
        const summary = fork.isAnswered ? fork.text.trim() : ''
        if (!isHard && summary === WAIT) {
          $.ui.status(`auto-compact: ${Math.round(tokens / 1000)}K tokens, waiting for a break`)
          return
        }
        if (!summary || summary === WAIT) {
          $.ui.toast(`auto-compact: no summary (${fork.isAnswered ? 'empty-reply' : fork.reason}), session kept`)
          return
        }
        // Kept across sessions so a failed submit after /clear loses nothing.
        await $.store.set(SUMMARY_KEY, summary)
        // shortcut: a prompt queued meanwhile runs before /clear, so the summary misses that turn.
        await $.command.run({ command: 'clear' })
        await $.prompt.submit({ text: handoff(summary) })
        $.ui.status(undefined)
        $.ui.toast(`auto-compact: new session started at ${Math.round(tokens / 1000)}K tokens`)
      } catch {
        $.ui.toast(`auto-compact: handoff failed; the summary is in the mod's store under ${SUMMARY_KEY}`)
      } finally {
        isPending = false
      }
    })
    return done
  })
}
