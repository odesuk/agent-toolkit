import { expect, test } from 'claude-code/testing'

import {
  availableToday,
  computeWeek,
  durationText,
  endOfToday,
  findLimit,
  hourlyBudget,
  paceAllowance,
  paceIcon,
  parseRecords,
  previousSessions,
  upsertSession,
  weekdayTime,
  weeklyShare,
} from './usage'
import type { SessionRecord } from './usage'

const now = new Date(2026, 9, 15, 12, 0, 0).getTime()
const hour = 3600000
// Window started 2 days (48 h) before the end of today.
const endToday = new Date(2026, 9, 16, 0, 0, 0).getTime()
const resetsAt = new Date(endToday - 48 * hour + 168 * hour).toISOString()

test('paceAllowance two days into the window', () => {
  expect(Math.abs((paceAllowance(resetsAt, now) ?? 0) - 28.571)).toBeLessThan(0.01)
})

test('availableToday goes negative above pace', () => {
  expect(Math.abs((availableToday(40, resetsAt, now) ?? 0) + 80)).toBeLessThan(0.05)
})

test('availableToday reads in day-percent', () => {
  expect(Math.abs((availableToday(10, resetsAt, now) ?? 0) - 130)).toBeLessThan(0.05)
})

test('hourlyBudget spreads the balance over hours to reset', () => {
  expect(Math.abs((hourlyBudget(10, resetsAt, now) ?? 0) - 114.5)).toBeLessThan(0.05)
})

test('hourlyBudget is null without a reset or after it', () => {
  expect(hourlyBudget(10, null, now)).toBe(null)
  expect(hourlyBudget(10, new Date(now - hour).toISOString(), now)).toBe(null)
})

test('carry-over: lower usage earlier leaves more available', () => {
  const sameUsageNow = availableToday(10, resetsAt, now) ?? 0
  const lowEarlier = availableToday(5, resetsAt, now) ?? 0
  expect(lowEarlier).toBeGreaterThan(sameUsageNow)
})

test('missing resetsAt gives null', () => {
  expect(availableToday(10, null, now)).toBe(null)
  expect(paceAllowance('not a date', now)).toBe(null)
})

const reset5pm = new Date(2026, 9, 20, 17, 0, 0).getTime()
const noon = new Date(2026, 9, 15, 12, 0, 0).getTime()
const evening = new Date(2026, 9, 15, 18, 0, 0).getTime()

test('today ends at the reset time of day', () => {
  expect(endOfToday(reset5pm, noon)).toBe(new Date(2026, 9, 15, 17, 0, 0).getTime())
})

test('after the reset time today ends the next day', () => {
  expect(endOfToday(reset5pm, evening)).toBe(new Date(2026, 9, 16, 17, 0, 0).getTime())
})

test('paceAllowance follows a 5 PM reset', () => {
  const iso = new Date(reset5pm).toISOString()
  expect(Math.abs((paceAllowance(iso, noon) ?? 0) - 28.571)).toBeLessThan(0.01)
  expect(Math.abs((paceAllowance(iso, evening) ?? 0) - 42.857)).toBeLessThan(0.01)
})

test('hourlyBudget with a 5 PM reset', () => {
  const iso = new Date(reset5pm).toISOString()
  expect(Math.abs((hourlyBudget(10, iso, noon) ?? 0) - 121.0)).toBeLessThan(0.05)
})

test('no seven_day reading gives the no-reading view', () => {
  const view = computeWeek([{ kind: 'five_hour', percentUsed: 5 }])
  expect(view.percentUsed).toBe(null)
  expect(view.resetsAt).toBe(null)
})

test('weekdayTime formats local day and time', () => {
  expect(weekdayTime(new Date(2026, 9, 16, 17, 0).getTime())).toBe('Fri 17:00')
})

test('durationText formats hours and minutes', () => {
  expect(durationText(3 * 3600000 + 55 * 60000)).toBe('3 h 55 m')
})

test('durationText under an hour shows minutes only', () => {
  expect(durationText(45 * 60000)).toBe('45 m')
})

test('durationText clamps negatives to zero', () => {
  expect(durationText(-1)).toBe('0 m')
})

test('findLimit picks by kind', () => {
  const limits = [
    { kind: 'seven_day', percentUsed: 20 },
    { kind: 'five_hour', percentUsed: 3 },
  ]
  expect(findLimit(limits, 'five_hour')?.percentUsed).toBe(3)
  expect(findLimit(limits, 'spend_limit')).toBe(undefined)
})

test('paceIcon thresholds', () => {
  expect(paceIcon(160)).toBe('🟢')
  expect(paceIcon(50)).toBe('🟢')
  expect(paceIcon(49.9)).toBe('🟡')
  expect(paceIcon(15)).toBe('🟡')
  expect(paceIcon(14.9)).toBe('🔴')
  expect(paceIcon(-20)).toBe('🔴')
})

const rec = (startedAt: number, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  startedAt,
  lastSeen: startedAt,
  usd: 1,
  weeklyStart: 10,
  weeklyLast: 10,
  resetsAt: null,
  resetsAtLast: null,
  ...extra,
})

test('upsertSession appends a new session sorted by start', () => {
  const out = upsertSession([rec(5)], rec(2))
  expect(out.map(r => r.startedAt)).toEqual([2, 5])
})

test('upsertSession replaces and keeps the original weeklyStart and resetsAt', () => {
  const first = rec(5, { weeklyStart: 10, resetsAt: 'a' })
  const out = upsertSession([first], rec(5, { usd: 3, weeklyStart: 14, weeklyLast: 14, resetsAt: 'b' }))
  expect(out.length).toBe(1)
  expect(out[0].usd).toBe(3)
  expect(out[0].weeklyStart).toBe(10)
  expect(out[0].weeklyLast).toBe(14)
  expect(out[0].resetsAt).toBe('a')
})

test('upsertSession trims to the newest max', () => {
  const out = upsertSession([rec(1), rec(2), rec(3)], rec(4), 2)
  expect(out.map(r => r.startedAt)).toEqual([3, 4])
})

test('previousSessions picks the newest 3, newest first', () => {
  const records = [rec(1), rec(2), rec(3), rec(4), rec(5)]
  expect(previousSessions(records, 5).map(r => r.startedAt)).toEqual([4, 3, 2])
})

test('previousSessions excludes the current and later ones', () => {
  const records = [rec(1), rec(3), rec(5), rec(7)]
  expect(previousSessions(records, 5).map(r => r.startedAt)).toEqual([3, 1])
})

test('previousSessions with fewer than 3 is fine', () => {
  expect(previousSessions([rec(1)], 5).length).toBe(1)
  expect(previousSessions([rec(5)], 5)).toEqual([])
})

test('upsertSession fills a null start from the current reading', () => {
  const first = rec(5, { weeklyStart: null, weeklyLast: null, resetsAt: null })
  const out = upsertSession([first], rec(5, { weeklyStart: 8, weeklyLast: 8, resetsAt: 'r' }))
  expect(out[0].weeklyStart).toBe(8)
  expect(out[0].resetsAt).toBe('r')
})

test('weeklyShare is null when the reset changed during the session', () => {
  expect(weeklyShare(rec(1, { weeklyLast: 15, resetsAt: 'a', resetsAtLast: 'b' }))).toBe(null)
  expect(weeklyShare(rec(1, { weeklyLast: 15, resetsAt: 'a', resetsAtLast: 'a' }))).toBe(5)
})

test('parseRecords accepts old records without resetsAtLast', () => {
  const { resetsAtLast, ...old } = rec(1)
  expect(parseRecords([old])).toEqual([rec(1)])
})

test('weeklyShare is the rounded rise', () => {
  expect(weeklyShare(rec(1, { weeklyStart: 10, weeklyLast: 12.6 }))).toBe(3)
})

test('weeklyShare is null when a reading is missing', () => {
  expect(weeklyShare(rec(1, { weeklyStart: null }))).toBe(null)
  expect(weeklyShare(rec(1, { weeklyLast: null }))).toBe(null)
})

test('weeklyShare is null when the value fell', () => {
  expect(weeklyShare(rec(1, { weeklyStart: 50, weeklyLast: 2 }))).toBe(null)
})

test('parseRecords drops malformed entries', () => {
  const good = rec(1)
  const out = parseRecords([good, null, 'x', { startedAt: 'a' }, { ...good, usd: undefined }])
  expect(out).toEqual([good])
})

test('parseRecords returns an empty list for non-arrays', () => {
  expect(parseRecords(undefined)).toEqual([])
  expect(parseRecords({ a: 1 })).toEqual([])
})
