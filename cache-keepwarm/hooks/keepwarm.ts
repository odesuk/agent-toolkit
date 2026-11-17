// The prompt cache lives for an hour after each request, so one ping per 50 minutes keeps it.
export const INTERVAL_MS = 50 * 60000
export const TICK_MS = 60000
export const RETRY_MS = 5 * 60000
export const BUSY_CAP_MS = 60 * 60000
export const DEFAULT_HOURS = 8
export const MAX_HOURS = 168

export type WarmState = {
  // Start of the person's main-thread turn in progress, in ms; null when none runs.
  busySince: number | null
  // The person's last message, in ms. The keep-warm window counts from here.
  lastMessage: number | null
  // Last main-thread turn end or ping, in ms. The cache is warm from here.
  lastWarm: number | null
}

// A ping is due when the window is open, no turn runs, and 50 minutes have passed since the
// cache was last touched. A ping never extends the window.
// shortcut: assumes the 1-hour cache TTL this session runs on; a 5-minute TTL needs an interval near 4 minutes.
// shortcut: a turn that never reports its end stops blocking pings after an hour, no later.
export function isWarmDue(s: WarmState, now: number, hours: number): boolean {
  if (hours <= 0 || s.lastMessage === null || s.lastWarm === null) return false
  if (s.busySince !== null && now - s.busySince < BUSY_CAP_MS) return false
  if (now - s.lastMessage > hours * 3600000) return false

  return now - s.lastWarm >= INTERVAL_MS
}

// A ping that got no answer is retried after RETRY_MS, so the cache still holds.
export function warmedAfterFailure(now: number): number {
  return now - INTERVAL_MS + RETRY_MS
}

// Reads the hours the tool's input carries: a number from 0 (off) to MAX_HOURS, else null.
export function parseHours(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_HOURS) return null

  return value
}

export type Command ={ kind: 'status' } | { kind: 'set'; hours: number } | { kind: 'invalid' }

// Reads what follows /keepwarm: nothing, a number of hours, off, or on.
export function parseCommand(args: string): Command {
  const word = args.trim().toLowerCase()
  if (word === '') return { kind: 'status' }
  if (word === 'off') return { kind: 'set', hours: 0 }
  if (word === 'on') return { kind: 'set', hours: DEFAULT_HOURS }

  const hours = Number(word)
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_HOURS) return { kind: 'invalid' }

  return { kind: 'set', hours }
}
