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
  weekdayTime,
} from './usage'

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
