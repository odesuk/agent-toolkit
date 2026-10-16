import type { WeekView } from '../types'

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

const HOUR = 3600000
const DAY = 24 * HOUR
const WINDOW_HOURS = 168
const DAY_SHARE = (100 * 24) / WINDOW_HOURS

export const findLimit = (limits: Limit[], kind: string): Limit | undefined =>
  limits.find(l => l.kind === kind)

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const weekdayTime = (ms: number): string => {
  const at = new Date(ms)
  const hh = String(at.getHours()).padStart(2, '0')
  const mm = String(at.getMinutes()).padStart(2, '0')

  return `${DAYS[at.getDay()]} ${hh}:${mm}`
}

export const durationText = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(total / 60)
  const m = total % 60

  return h >= 1 ? `${h} h ${m} m` : `${m} m`
}

export const computeWeek = (limits: Limit[]): WeekView => {
  const limit = findLimit(limits, 'seven_day')

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

// Pace status for the day figure: 50+ green, 15 to under 50 yellow, under 15 red.
export const paceIcon = (available: number): string =>
  available >= 50 ? '🟢' : available >= 15 ? '🟡' : '🔴'

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

export type SessionRecord = {
  startedAt: number
  lastSeen: number
  usd: number
  weeklyStart: number | null
  weeklyLast: number | null
  resetsAt: string | null
  resetsAtLast: string | null
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const numberOrNull = (v: unknown): boolean => v === null || isNumber(v)
const textOrNull = (v: unknown): boolean => v === null || typeof v === 'string'

// Store data may come from older versions, so keep only well-formed records.
// Records saved before resetsAtLast existed get null for it.
export const parseRecords = (value: unknown): SessionRecord[] => {
  if (!Array.isArray(value)) return []

  return value
    .filter(
      r =>
        typeof r === 'object' &&
        r !== null &&
        isNumber(r.startedAt) &&
        isNumber(r.lastSeen) &&
        isNumber(r.usd) &&
        numberOrNull(r.weeklyStart) &&
        numberOrNull(r.weeklyLast) &&
        textOrNull(r.resetsAt) &&
        (r.resetsAtLast === undefined || textOrNull(r.resetsAtLast)),
    )
    .map(r => ({ ...r, resetsAtLast: r.resetsAtLast ?? null }))
}

export const upsertSession = (
  records: SessionRecord[],
  current: SessionRecord,
  max = 10,
): SessionRecord[] => {
  const existing = records.find(r => r.startedAt === current.startedAt)
  const merged =
    existing === undefined
      ? current
      : {
          ...current,
          weeklyStart: existing.weeklyStart ?? current.weeklyStart,
          resetsAt: existing.resetsAt ?? current.resetsAt,
        }
  const others = records.filter(r => r.startedAt !== current.startedAt)

  return [...others, merged].sort((a, b) => a.startedAt - b.startedAt).slice(-max)
}

export const previousSessions = (
  records: SessionRecord[],
  currentStartedAt: number,
  count = 3,
): SessionRecord[] =>
  records
    .filter(r => r.startedAt < currentStartedAt)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, count)

// Rise in the weekly percent while the session ran; null if a reset fell in between.
export const weeklyShare = (r: SessionRecord): number | null => {
  if (r.weeklyStart === null || r.weeklyLast === null) return null
  if (r.weeklyLast < r.weeklyStart) return null
  if (r.resetsAt !== null && r.resetsAtLast !== null && r.resetsAt !== r.resetsAtLast) return null

  return Math.round(r.weeklyLast - r.weeklyStart)
}
