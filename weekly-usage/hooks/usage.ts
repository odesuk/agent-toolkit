import type { WeekView } from '../types'

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

const HOUR = 3600000
const DAY = 24 * HOUR
const WINDOW_HOURS = 168
const DAY_SHARE = (100 * 24) / WINDOW_HOURS

export const computeWeek = (limits: Limit[]): WeekView => {
  const limit = limits.find(l => l.kind === 'seven_day')

  return { percentUsed: limit?.percentUsed ?? null, resetsAt: limit?.resetsAt ?? null }
}

// A day runs between boundaries 24 h apart, aligned to the reset time of day.
export const endOfToday = (reset: number, now: number): number => {
  const days = Math.floor((reset - now) / DAY)
  const end = reset - days * DAY

  return end > now ? end : end + DAY
}

// Share of the weekly limit that has accrued by the end of today.
export const paceAllowance = (resetsAt: string | null, now: number): number | null => {
  if (resetsAt === null) return null
  const reset = Date.parse(resetsAt)
  if (Number.isNaN(reset)) return null
  const windowStart = reset - WINDOW_HOURS * HOUR
  const elapsed = Math.min(WINDOW_HOURS, Math.max(0, (endOfToday(reset, now) - windowStart) / HOUR))

  return (100 * elapsed) / WINDOW_HOURS
}

export const availableToday = (
  percentUsed: number,
  resetsAt: string | null,
  now: number,
): number | null => {
  const allowance = paceAllowance(resetsAt, now)
  if (allowance === null) return null

  return Math.round(((allowance - percentUsed) / DAY_SHARE) * 100 * 10) / 10
}

export const hourlyBudget = (
  percentUsed: number,
  resetsAt: string | null,
  now: number,
): number | null => {
  if (resetsAt === null) return null
  const reset = Date.parse(resetsAt)
  if (Number.isNaN(reset)) return null
  const hours = (reset - now) / HOUR
  if (hours <= 0) return null
  const remainingDay = ((100 - percentUsed) / DAY_SHARE) * 100

  return Math.round(((remainingDay * 24) / hours) * 10) / 10
}
