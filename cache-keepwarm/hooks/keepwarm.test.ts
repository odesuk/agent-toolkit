import { expect, test } from 'claude-code/testing'

import {
  BUSY_CAP_MS,
  DEFAULT_HOURS,
  INTERVAL_MS,
  MAX_HOURS,
  RETRY_MS,
  isWarmDue,
  parseCommand,
  parseHours,
  warmedAfterFailure,
} from './keepwarm'
import type { WarmState } from './keepwarm'

const H = 3600000
const idle: WarmState = { busySince: null, lastMessage: 0, lastWarm: 0 }

test('no ping before 50 minutes since the cache was touched', () => {
  expect(isWarmDue(idle, INTERVAL_MS - 1, DEFAULT_HOURS)).toBe(false)
})

test('ping at 50 minutes since the cache was touched', () => {
  expect(isWarmDue(idle, INTERVAL_MS, DEFAULT_HOURS)).toBe(true)
})

test('no ping again until another 50 minutes after a ping', () => {
  expect(isWarmDue({ ...idle, lastWarm: INTERVAL_MS }, INTERVAL_MS + 10 * 60000, DEFAULT_HOURS)).toBe(false)
})

test('no ping while a turn runs', () => {
  expect(isWarmDue({ ...idle, busySince: INTERVAL_MS - 1000 }, INTERVAL_MS, DEFAULT_HOURS)).toBe(false)
})

test('a turn that never reports its end stops blocking after the cap', () => {
  expect(isWarmDue({ ...idle, busySince: 0 }, BUSY_CAP_MS, DEFAULT_HOURS)).toBe(true)
})

test('no ping before the person has sent a message', () => {
  expect(isWarmDue({ busySince: null, lastMessage: null, lastWarm: null }, 10 * INTERVAL_MS, DEFAULT_HOURS)).toBe(false)
})

test('window closes after the set hours since the last message', () => {
  expect(isWarmDue(idle, 8 * H, 8)).toBe(true)
  expect(isWarmDue({ ...idle, lastWarm: 8 * H - 1 }, 8 * H + INTERVAL_MS, 8)).toBe(false)
})

test('pings do not move the window: it counts from the last message alone', () => {
  // Cache touched by pings only, at 8 h and 50 min: the message at 0 is 8 h 50 min old, so no ping.
  expect(isWarmDue({ busySince: null, lastMessage: 0, lastWarm: 8 * H }, 8 * H + INTERVAL_MS, 8)).toBe(false)
})

test('a failed ping is retried after 5 minutes, inside the cache lifetime', () => {
  const failed = { ...idle, lastWarm: warmedAfterFailure(INTERVAL_MS) }
  expect(isWarmDue(failed, INTERVAL_MS + RETRY_MS - 1, DEFAULT_HOURS)).toBe(false)
  expect(isWarmDue(failed, INTERVAL_MS + RETRY_MS, DEFAULT_HOURS)).toBe(true)
})

test('zero hours turns keep-warm off', () => {
  expect(isWarmDue(idle, INTERVAL_MS, 0)).toBe(false)
})

test('parseCommand reads status, hours, off and on', () => {
  expect(parseCommand('')).toEqual({ kind: 'status' })
  expect(parseCommand('  ')).toEqual({ kind: 'status' })
  expect(parseCommand('4')).toEqual({ kind: 'set', hours: 4 })
  expect(parseCommand('0.5')).toEqual({ kind: 'set', hours: 0.5 })
  expect(parseCommand('off')).toEqual({ kind: 'set', hours: 0 })
  expect(parseCommand('on')).toEqual({ kind: 'set', hours: DEFAULT_HOURS })
})

test('parseHours takes 0 to the maximum and nothing else', () => {
  expect(parseHours(0)).toBe(0)
  expect(parseHours(4.5)).toBe(4.5)
  expect(parseHours(MAX_HOURS)).toBe(MAX_HOURS)
  expect(parseHours(MAX_HOURS + 1)).toBe(null)
  expect(parseHours(-1)).toBe(null)
  expect(parseHours('4')).toBe(null)
  expect(parseHours(undefined)).toBe(null)
  expect(parseHours(Number.NaN)).toBe(null)
})

test('parseCommand refuses what is not a duration', () => {
  expect(parseCommand('abc')).toEqual({ kind: 'invalid' })
  expect(parseCommand('-1')).toEqual({ kind: 'invalid' })
  expect(parseCommand('200')).toEqual({ kind: 'invalid' })
})
