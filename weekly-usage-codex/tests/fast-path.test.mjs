import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const skill = await readFile(new URL('../skills/weekly-usage/SKILL.md', import.meta.url), 'utf8')
const code = skill.match(/```javascript\r?\n([\s\S]*?)```/)?.[1]
assert.ok(code, 'skill contains the fast path')
const run = Object.getPrototypeOf(async function () {}).constructor('ALL_TOOLS', 'tools', 'text', 'exit', 'Date', 'Intl', code)

async function render(snapshot) {
  const output = []
  const stop = Symbol('exit')
  const now = Date.parse('2026-10-15T12:00:00Z')
  class Clock extends Date { static now() { return now } }
  const response = { structuredContent: { rateLimits: snapshot } }
  try {
    await run([{ name: 'mcp__codex_app__get_usage_limits' }], { mcp__codex_app__get_usage_limits: async () => response }, s => output.push(s), () => { throw stop }, Clock, Intl)
  } catch (error) {
    if (error !== stop) throw error
  }
  return output.join('\n')
}

test('computes the daily share from the weekly limit', async () => {
  const reset = Date.parse('2026-10-20T12:00:00Z') / 1000
  const result = await render({ secondary: { windowDurationMins: 10080, usedPercent: 10, resetsAt: reset } })
  assert.match(result, /230\.0% of today's share available until \w{3} \d\d:\d\d \(24 h 0 m\)/)
  assert.match(result, /🟢 Weekly: 10% used, 90% left/)
  assert.match(result, /Hourly: 126\.0% per hour for 120 h 0 m to reset/)
})

test('does not invent a weekly limit', async () => {
  assert.equal(await render({ primary: { windowDurationMins: 300, usedPercent: 10 } }), 'No weekly limit reading is available for this Codex account.')
})
