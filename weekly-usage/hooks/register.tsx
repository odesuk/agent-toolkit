import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import {
  availableToday,
  computeWeek,
  durationText,
  endOfToday,
  findLimit,
  hourlyBudget,
  paceIcon,
  parseRecords,
  previousSessions,
  upsertSession,
  weekdayTime,
  weeklyShare,
} from './usage'
import type { Limit } from './usage'

const PANE = 'weekly-usage'
const SESSIONS = 'sessions'
const REFRESH = 5 * 60000
const week = atom({ plugin: 'weekly-usage', key: 'week' } as const, null)

const clockText = (ms: number) => {
  const at = new Date(ms)

  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

const parseReset = (resetsAt: string | null | undefined): number | null => {
  if (resetsAt === null || resetsAt === undefined) return null
  const ms = Date.parse(resetsAt)

  return Number.isNaN(ms) ? null : ms
}

const weeklyResetText = (resetsAt: string | null, now: number) => {
  const reset = parseReset(resetsAt)
  if (reset === null) return ''
  const hours = (reset - now) / 3600000
  const left = hours < 1 ? `${Math.max(0, Math.round(hours * 60))} min` : `${Math.round(hours)} h`

  return ` Resets ${weekdayTime(reset)} (${left})`
}

async function record($: EngineInterface, limits: Limit[]) {
  await update($, week, () => computeWeek(limits))
}

async function track($: EngineInterface) {
  try {
    const usage = await $.session.usage()
    const weekly = findLimit(usage.rateLimits, 'seven_day')
    const current = {
      startedAt: usage.startedAt,
      lastSeen: await $.clock.now(),
      usd: usage.cost?.usd ?? 0,
      weeklyStart: weekly?.percentUsed ?? null,
      weeklyLast: weekly?.percentUsed ?? null,
      resetsAt: weekly?.resetsAt ?? null,
      resetsAtLast: weekly?.resetsAt ?? null,
    }
    await $.store.set(SESSIONS, upsertSession(parseRecords(await $.store.get(SESSIONS)), current))
  } catch {
    // Tracking is best effort and must never break a hook.
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void $.ui.open({ id: PANE, title: 'Weekly usage' })
    await $.store.delete('readings')
    $.clock.every(REFRESH, () => {
      void track($)
      $.ui.invalidate('ui.render')
    })
    const usage = await $.session.usage()
    await record($, usage.rateLimits)
    await track($)
    await $.command.register({
      name: 'weekly-usage',
      description: 'Open the weekly usage pane and refresh it',
    })

    return next(e)
  })

  on('command.run', { command: 'weekly-usage' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Weekly usage' })
    let refreshed = false
    try {
      const result = await $.model.complete({
        model: 'haiku',
        prompt: 'Reply with the word ok.',
        maxTokens: 1,
        effort: 'low',
        timeoutMs: 20000,
      })
      refreshed = result.isAnswered === true
    } catch {
      refreshed = false
    }
    const usage = await $.session.usage()
    await record($, usage.rateLimits)
    const view = computeWeek(usage.rateLimits)
    if (view.percentUsed === null) return { text: 'No weekly limit reading yet.' }
    const now = await $.clock.now()
    const available = availableToday(view.percentUsed, view.resetsAt, now)
    if (available === null) return { text: 'No weekly limit reading yet.' }
    const time = clockText(now)
    const reset = parseReset(view.resetsAt)
    const until = reset === null ? 'for today' : `until ${weekdayTime(endOfToday(reset, now))}`

    const stamp = refreshed ? `read ${time}` : 'could not refresh'

    const perHour = hourlyBudget(view.percentUsed, view.resetsAt, now)
    const hourly = perHour === null ? '' : `, ${perHour.toFixed(1)}% per hour to reset`

    return { text: `${available.toFixed(1)}% available ${until}${hourly} (${stamp})` }
  })

  on('session.measure', async ($, e, next) => {
    await record($, e.rateLimits)
    await track($)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const view = await read($, week)
    if (view === null) return <Text dimColor>Waiting for the first reading.</Text>
    if (view.percentUsed === null) {
      return <Text>No weekly limit reading. This needs a Claude subscription.</Text>
    }
    const now = await $.clock.now()
    const available = availableToday(view.percentUsed, view.resetsAt, now)
    const left = Math.round((100 - view.percentUsed) * 10) / 10
    const hourly = hourlyBudget(view.percentUsed, view.resetsAt, now)
    const reset = parseReset(view.resetsAt)
    const headline =
      available === null || reset === null
        ? "⚪ Today's share unknown"
        : `${paceIcon(available)} ${available.toFixed(1)}% available until ${weekdayTime(endOfToday(reset, now))}`
    const usage = await $.session.usage()
    const fiveHour = findLimit(usage.rateLimits, 'five_hour')
    const fiveReset = parseReset(fiveHour?.resetsAt)
    const cost = usage.cost
    const previous = previousSessions(parseRecords(await $.store.get(SESSIONS)), usage.startedAt)

    return (
      <Box flexDirection="column">
        <Text bold>{headline}</Text>
        <Text>
          📅 Weekly: {view.percentUsed}% used, {left}% left.{weeklyResetText(view.resetsAt, now)}
        </Text>
        {hourly !== null && (
          <Text>
            ⏱️ Hourly: {hourly.toFixed(1)}% per hour to reset (base 100% per hour)
          </Text>
        )}
        {fiveHour !== undefined && (
          <Text>
            ⏳ 5-hour: {fiveHour.percentUsed}% used.
            {fiveReset === null ? '' : ` Resets in ${durationText(fiveReset - now)}`}
          </Text>
        )}
        {cost !== undefined && (
          <Text dimColor>
            💲 This session: ${cost.usd.toFixed(2)} · running {durationText(now - usage.startedAt)}
          </Text>
        )}
        {cost === undefined && (
          <Text dimColor>🕒 This session: running {durationText(now - usage.startedAt)}</Text>
        )}
        {previous.length > 0 && (
          <Box flexDirection="column">
            <Text dimColor>🕘 Recent sessions</Text>
            {previous.map(r => {
              const share = weeklyShare(r)

              return (
                <Text dimColor key={r.startedAt}>
                  {'   '}
                  {weekdayTime(r.startedAt)} · ${r.usd.toFixed(2)}
                  {share === null ? '' : ` · about ${share}% of the weekly limit`}
                </Text>
              )
            })}
          </Box>
        )}
      </Box>
    )
  })
}
