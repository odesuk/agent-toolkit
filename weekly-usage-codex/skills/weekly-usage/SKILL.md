---
name: weekly-usage
description: Show how much of today's Codex usage share remains before the weekly limit resets.
---

# Weekly usage

When `functions.exec` is available, run the following JavaScript in one call. It reads the current account limits with the Codex desktop tool and computes the same daily share as the bundled script. Report the result exactly. If the client provides a timezone that differs from the execution environment, use that timezone in the formatter.

```javascript
if (!ALL_TOOLS.some(t => t.name === 'mcp__codex_app__get_usage_limits')) {
  text('FAST_PATH_UNAVAILABLE'); exit()
}
let data
try {
  const r = await tools.mcp__codex_app__get_usage_limits({})
  if (r.isError) throw new Error('Usage tool failed')
  data = r.structuredContent ?? JSON.parse(r.content.find(c => c.type === 'text').text)
} catch { text('FAST_PATH_UNAVAILABLE'); exit() }
const snapshot = data.rateLimitsByLimitId?.codex ?? data.rateLimits
const weekly = [snapshot?.primary, snapshot?.secondary].find(w => w?.windowDurationMins === 10080)
if (!weekly || !Number.isFinite(weekly.usedPercent) || !Number.isFinite(weekly.resetsAt)) {
  text('No weekly limit reading is available for this Codex account.'); exit()
}
const now = Date.now(), day = 86400000, week = 7 * day, reset = weekly.resetsAt * 1000
let end = reset - Math.floor((reset - now) / day) * day
if (end <= now) end += day
const elapsed = Math.min(week, Math.max(0, end - (reset - week)))
const available = Math.round(((100 * elapsed / week - weekly.usedPercent) / (100 / 7)) * 1000) / 10
const at = ms => new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)).replace(',', '')
const minutes = Math.max(0, Math.floor((reset - now) / 60000)), hours = Math.floor(minutes / 60)
const remaining = hours ? `${hours} h ${minutes % 60} m` : `${minutes} m`
const left = Math.round((100 - weekly.usedPercent) * 10) / 10
const pace = v => v >= 50 ? '🟢' : v >= 15 ? '🟡' : '🔴'
const hourly = reset > now ? `\nHourly: ${(Math.round(((100 - weekly.usedPercent) * 168 / ((reset - now) / 3600000)) * 10) / 10).toFixed(1)}% per hour for ${remaining} to reset (base 100% per hour)` : ''
text(`${pace(available)} ${available.toFixed(1)}% of today's share available until ${at(end)} (${Math.floor((end - now) / 3600000)} h ${Math.floor((end - now) / 60000) % 60} m)\n${pace(left)} Weekly: ${weekly.usedPercent}% used, ${left}% left. Resets ${at(reset)} (${remaining})${hourly}`)
```

If `functions.exec` is unavailable or returns `FAST_PATH_UNAVAILABLE`, run `node scripts/weekly-usage.mjs` using the absolute path to the script in this skill's directory, and report its output exactly. If neither path can read a weekly limit and reset time, report that it is unavailable rather than inferring an allowance.
