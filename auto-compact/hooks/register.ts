import type { Register } from 'claude-code'

const DEFAULT_THRESHOLD = 250_000
const FIRST_DELAY_MS = 500
const RETRY_DELAY_MS = 3_000
const MAX_TRIES = 5

export const register: Register = (on, options) => {
  const threshold =
    typeof options.threshold === 'number' && options.threshold > 0
      ? options.threshold
      : DEFAULT_THRESHOLD
  // One compaction at a time; the next turn's usage reads the compacted size.
  let isPending = false

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || isPending) return done

    const { context } = await $.session.usage()
    const tokens = context.tokens ?? 0
    if (tokens < threshold) return done

    isPending = true
    const attempt = (n: number) =>
      $.clock.after(n === 0 ? FIRST_DELAY_MS : RETRY_DELAY_MS, async () => {
        try {
          // compact() rejects while a turn runs, so it runs on a timer after the turn.
          const result = await $.session.compact()
          isPending = false
          $.ui.toast(
            'skip' in result && result.skip
              ? `auto-compact: skipped (${result.skip})`
              : `auto-compact: compacted at ${Math.round(tokens / 1000)}K tokens`,
          )
        } catch {
          if (n + 1 < MAX_TRIES) return attempt(n + 1)
          isPending = false
          $.ui.toast('auto-compact: could not compact, a turn kept running')
        }
      })
    attempt(0)
    return done
  })
}
