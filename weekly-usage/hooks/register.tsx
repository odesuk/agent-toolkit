import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import {
  availableToday,
  computeWeek,
  endOfToday,
  hourlyBudget,
  paceAllowance,
} from './usage'
import type { Limit } from './usage'

const PANE = 'weekly-usage'
const REFRESH = 5 * 60000
const week = atom({ plugin: 'weekly-usage', key: 'week' } as const, null)

const clockText = (ms: number) => {
  const at = new Date(ms)

  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

const hoursText =(resetsAt: string | null, now: number) => {
  if (resetsAt === null) return ''
  const hours = (Date.parse(resetsAt) - now) / 3600000
  if (Number.isNaN(hours)) return ''
  if (hours < 1) return ` Resets in ${Math.max(0, Math.round(hours * 60))} min`

  return ` Resets in ${Math.round(hours)} h`
}

async function record($: EngineInterface, limits: Limit[]) {
  await update($, week, () => computeWeek(limits))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void $.ui.open({ id: PANE, title: 'Weekly usage' })
    await $.store.delete('readings')
    $.clock.every(REFRESH, () => $.ui.invalidate('ui.render'))
    const usage = await $.session.usage()
    await record($, usage.rateLimits)
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

    const stamp = refreshed ? `read ${time}` : 'could not refresh'

    const perHour = hourlyBudget(view.percentUsed, view.resetsAt, now)
    const hourly = perHour === null ? '' : `, ${perHour.toFixed(1)}% per hour to reset`

    return { text: `${available.toFixed(1)}% available for today${hourly} (${stamp})` }
  })

  on('session.measure', async ($, e, next) => {
    await record($, e.rateLimits)

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
    const allowance = paceAllowance(view.resetsAt, now)
    const left = Math.round((100 - view.percentUsed) * 10) / 10
    const hourly = hourlyBudget(view.percentUsed, view.resetsAt, now)
    const headline =
      available === null ? "Today's share unknown" : `${available.toFixed(1)}% available for today`

    return (
      <Box flexDirection="column">
        <Text bold>{headline}</Text>
        <Text>
          Weekly: {view.percentUsed}% used, {left}% left.{hoursText(view.resetsAt, now)}
        </Text>
        {hourly !== null && (
          <Text>
            Hourly: {hourly.toFixed(1)}% per hour to reset (base 100% per hour)
          </Text>
        )}
        {allowance !== null && view.resetsAt !== null && (
          <Text>
            On pace to today's end at {clockText(endOfToday(Date.parse(view.resetsAt), now))}:{' '}
            {allowance.toFixed(1)}% of the weekly limit
          </Text>
        )}
      </Box>
    )
  })
}
