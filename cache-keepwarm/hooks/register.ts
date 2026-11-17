import type { EngineInterface, Register } from 'claude-code'

import { DEFAULT_HOURS, TICK_MS, isWarmDue, parseCommand, warmedAfterFailure } from './keepwarm'
import type { WarmState } from './keepwarm'

const HOURS = 'hours'
const PROBE = 'Reply with the word ok. Answer at once, without thinking it over, and use no tools.'
const state: WarmState = { busySince: null, lastMessage: null, lastWarm: null }

async function hoursOf($: EngineInterface): Promise<number> {
  try {
    const stored = await $.store.get(HOURS)

    return typeof stored === 'number' ? stored : DEFAULT_HOURS
  } catch {
    return DEFAULT_HOURS
  }
}

const clockText = (ms: number) => {
  const at = new Date(ms)

  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

// A fork reuses the session's own transcript, so its prefix is read from the cache.
async function warm($: EngineInterface) {
  const now = await $.clock.now()
  if (!isWarmDue(state, now, await hoursOf($))) return
  state.lastWarm = now
  try {
    const reply = await $.model.fork({ prompt: PROBE })
    if (!reply.isAnswered && reply.reason !== 'nothing-to-fork') state.lastWarm = warmedAfterFailure(now)
  } catch {
    state.lastWarm = warmedAfterFailure(now)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(TICK_MS, () => {
      void warm($)
    })
    await $.command.register({
      name: 'keepwarm',
      description: 'Keep the prompt cache warm after your last message',
      argumentHint: '[hours|off|on]',
    })

    return next(e)
  })

  // The window counts from the person's own messages, so forks and subagents never extend it.
  on('prompt.submit', async ($, e, next) => {
    state.lastMessage = await $.clock.now()

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) state.busySince = await $.clock.now()

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      state.busySince = null
      state.lastWarm = await $.clock.now()
    }

    return next(e)
  })

  on('command.run', { command: 'keepwarm' }, async ($, e) => {
    const cmd = parseCommand(e.args)
    if (cmd.kind === 'invalid') {
      return { text: 'Use /keepwarm, /keepwarm <hours>, /keepwarm off or /keepwarm on.' }
    }
    if (cmd.kind === 'set') {
      await $.store.set(HOURS, cmd.hours)

      return { text: cmd.hours === 0 ? 'Keep-warm is off.' : `Keep-warm set to ${cmd.hours} h after your last message.` }
    }
    const hours = await hoursOf($)
    if (hours === 0) return { text: 'Keep-warm is off.' }
    const last = state.lastWarm === null ? 'no request yet' : `cache last warmed ${clockText(state.lastWarm)}`

    return { text: `Keep-warm: ${hours} h after your last message; pings every 50 min; ${last}.` }
  })
}
