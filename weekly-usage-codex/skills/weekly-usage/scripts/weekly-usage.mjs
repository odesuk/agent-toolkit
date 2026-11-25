#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

const weekdayTime = ms => {
  const at = new Date(ms)
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][at.getDay()]} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

const endOfToday = (reset, now) => {
  const days = Math.floor((reset - now) / DAY)
  const end = reset - days * DAY
  return end > now ? end : end + DAY
}

const duration = ms => {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours} h ${minutes % 60} m` : `${minutes} m`
}

// 50+ green, 15 to under 50 yellow, under 15 red.
const pace = v => v >= 50 ? '🟢' : v >= 15 ? '🟡' : '🔴'

function format(snapshot, now = Date.now()) {
  const windows = [snapshot?.primary, snapshot?.secondary].filter(Boolean)
  const weekly = windows.find(w => w.windowDurationMins === 10_080)
  if (!weekly || !Number.isFinite(weekly.usedPercent) || !Number.isFinite(weekly.resetsAt)) {
    return 'No weekly limit reading is available for this Codex account.'
  }

  const reset = weekly.resetsAt * 1000
  const windowStart = reset - WEEK
  const end = endOfToday(reset, now)
  const elapsed = Math.min(WEEK, Math.max(0, end - windowStart))
  const todayShare = (100 * elapsed) / WEEK
  const dailyPercentLeft = Math.round((((todayShare - weekly.usedPercent) / (100 / 7)) * 100) * 10) / 10
  const resetLeft = duration(reset - now)

  const left = Math.round((100 - weekly.usedPercent) * 10) / 10
  const perHour = Math.round(((100 - weekly.usedPercent) * 168 / ((reset - now) / HOUR)) * 10) / 10
  const hourly = reset > now ? `\nHourly: ${perHour.toFixed(1)}% per hour for ${resetLeft} to reset (base 100% per hour)` : ''

  return `${pace(dailyPercentLeft)} ${dailyPercentLeft.toFixed(1)}% of today's share available until ${weekdayTime(end)} (${duration(end - now)})\n${pace(left)} Weekly: ${weekly.usedPercent}% used, ${left}% left. Resets ${weekdayTime(reset)} (${resetLeft})${hourly}`
}

function readRateLimits() {
  return new Promise((resolve, reject) => {
    const windows = process.platform === 'win32'
    const child = spawn(windows ? 'cmd.exe' : 'codex', windows
      ? ['/d', '/s', '/c', 'codex app-server --listen stdio://']
      : ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const lines = createInterface({ input: child.stdout })
    let stderr = ''
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      lines.close()
      child.stdin.end()
      setTimeout(() => child.kill(), 1000).unref()
      error ? reject(error) : resolve(value)
    }
    const request = (id, method, params) => child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    const timer = setTimeout(() => finish(new Error('Codex app-server timed out.')), 15_000)

    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    child.on('error', error => finish(error))
    child.on('close', code => {
      if (!settled) finish(new Error(stderr.trim() || `Codex app-server exited (${code}).`))
    })
    lines.on('line', line => {
      let message
      try { message = JSON.parse(line) } catch { return }
      if (message.id === 1) {
        if (message.error) return finish(new Error(message.error.message || 'Codex app-server initialization failed.'))
        child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`)
        request(2, 'account/rateLimits/read', {})
      } else if (message.id === 2) {
        if (message.error) return finish(new Error(message.error.message || 'Could not read Codex rate limits.'))
        const response = message.result
        const snapshot = response?.rateLimitsByLimitId?.codex ?? response?.rateLimits
        finish(null, snapshot)
      }
    })
    request(1, 'initialize', { clientInfo: { name: 'weekly-usage', title: 'Weekly usage', version: '0.1.0' } })
  })
}

try {
  console.log(format(await readRateLimits()))
} catch (error) {
  console.error(`Could not read Codex usage: ${error.message}`)
  process.exitCode = 1
}
