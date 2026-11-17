import type { EngineInterface, Register } from 'claude-code'

import { DEFAULT_HOURS, MAX_HOURS, TICK_MS, isWarmDue, parseCommand, parseHours, warmedAfterFailure } from './keepwarm'
import type { WarmState } from './keepwarm'

const HOURS = 'hours'
const PROBE = 'Reply with the word ok. Answer at once, without thinking it over, and use no tools.'
const state: WarmState = { busySince: null, lastMessage: null, lastWarm: null }
let pinging = false
let toolName = ''

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

async function status($: EngineInterface): Promise<string> {
  const hours = await hoursOf($)
  if (hours === 0) return 'Keep-warm is off.'
  const last = state.lastWarm === null ? 'no request yet' : `cache last warmed ${clockText(state.lastWarm)}`

  return `Keep-warm: ${hours} h after your last message; pings every 50 min; ${last}.`
}

async function setHours($: EngineInterface, hours: number): Promise<string> {
  await $.store.set(HOURS, hours)

  return hours === 0 ? 'Keep-warm is off.' : `Keep-warm set to ${hours} h after your last message.`
}

// A fork reuses the session's own transcript, so its prefix is read from the cache.
async function ping($: EngineInterface): Promise<string> {
  const now = await $.clock.now()
  if (pinging) return 'A ping is already running.'
  pinging = true
  try {
    const reply = await $.model.fork({ prompt: PROBE })
    if (reply.isAnswered) {
      state.lastWarm = now

      return `Ping answered at ${clockText(now)}; the cache is warm.`
    }
    if (reply.reason !== 'nothing-to-fork') state.lastWarm = warmedAfterFailure(now)

    return `Ping got no answer: ${reply.reason}.`
  } catch {
    state.lastWarm = warmedAfterFailure(now)

    return 'Ping failed.'
  } finally {
    pinging = false
  }
}

async function warm($: EngineInterface) {
  const now = await $.clock.now()
  if (isWarmDue(state, now, await hoursOf($))) await ping($)
}

const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['status', 'set', 'ping'],
      description: 'status shows the setting; set changes the window; ping sends one keep-warm request now.',
    },
    hours: {
      type: 'number',
      description: `For set: hours after the person's last message to keep pinging. 0 turns it off. Up to ${MAX_HOURS}.`,
    },
  },
  required: ['action'],
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
    const registered = await $.tool.register({
      name: 'keepwarm',
      description:
        'Keeps the prompt cache warm so the next message reads the cache instead of writing it again. ' +
        `Actions: status, set (with hours; default ${DEFAULT_HOURS}, 0 is off) and ping (one keep-warm request now).`,
      inputSchema: TOOL_SCHEMA,
    })
    toolName = registered.tool

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
    if (cmd.kind === 'set') return { text: await setHours($, cmd.hours) }

    return { text: await status($) }
  })

  // Serves the tool the model calls. Every other tool call passes on untouched.
  on('tool.call', async ($, e, next) => {
    if (toolName === '' || e.tool !== toolName) return next(e)
    const input = e as unknown as { action?: unknown; hours?: unknown }
    if (input.action === 'status') return { result: await status($) }
    if (input.action === 'ping') return { result: await ping($) }
    if (input.action === 'set') {
      const hours = parseHours(input.hours)

      return hours === null
        ? { deny: `For set, give hours from 0 to ${MAX_HOURS}.` }
        : { result: await setHours($, hours) }
    }

    return { deny: 'Use action status, set or ping.' }
  })
}
