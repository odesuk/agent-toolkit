import type { SkillRow } from '../types'

type Listed = { name: string; source: string; pluginName?: string }

// Override keys read `plugin:skill`; a listing name may leave the prefix off.
export const skillKey = (s: Listed) =>
  s.pluginName && !s.name.includes(':') ? `${s.pluginName}:${s.name}` : s.name

// `claude plugin enable` and `disable` take these scopes only. A plugin loaded
// for the session alone (`--plugin-dir`) or synced from an account has another.
export const canSwitch = (scope: string) => ['user', 'project', 'local'].includes(scope)

// A listed skill is on unless an override turns it off. An "off" override is
// no longer listed, so it is added from the settings alone.
export function mergeSkills(
  listed: readonly Listed[],
  overrides: Record<string, string> = {},
): SkillRow[] {
  const rows = new Map<string, SkillRow>()
  for (const s of listed) {
    const key = skillKey(s)
    rows.set(key, { key, source: s.source, isOn: overrides[key] !== 'off' })
  }
  for (const [key, mode] of Object.entries(overrides)) {
    if (mode === 'off' && !rows.has(key)) rows.set(key, { key, source: '', isOn: false })
  }

  return [...rows.values()].sort(
    (a, b) => Number(b.isOn) - Number(a.isOn) || a.key.localeCompare(b.key),
  )
}

// Edits `skillOverrides` and nothing else. Throws on text that is not JSON,
// so the caller writes nothing.
// shortcut: turning a skill on deletes its override, so a "name-only" mode is lost.
export function setSkill(text: string, key: string, isOn: boolean): string {
  const settings = JSON.parse(text)
  const overrides = { ...settings.skillOverrides }
  if (isOn) delete overrides[key]
  else overrides[key] = 'off'
  if (Object.keys(overrides).length === 0) delete settings.skillOverrides
  else settings.skillOverrides = overrides

  return JSON.stringify(settings, null, 2) + '\n'
}
