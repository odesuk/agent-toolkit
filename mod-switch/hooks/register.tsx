import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PluginRow, SkillRow } from '../types'
import { mergeSkills, setSkill } from './lib'

const PANE = 'mod-switch'
const tab = atom({ plugin: 'mod-switch', key: 'tab' } as const, 'plugins')
const plugins = atom({ plugin: 'mod-switch', key: 'plugins' } as const, [])
const skills = atom({ plugin: 'mod-switch', key: 'skills' } as const, [])
const note = atom({ plugin: 'mod-switch', key: 'note' } as const, '')

const say = ($: EngineInterface, text: string) => update($, note, () => text)
const why = (err: unknown) => (err instanceof Error ? err.message : String(err))

async function settingsPath($: EngineInterface) {
  const dir =
    (await $.env.get('CLAUDE_CONFIG_DIR')) ??
    `${(await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))}/.claude`

  return `${dir}/settings.json`
}

async function loadPlugins($: EngineInterface): Promise<PluginRow[]> {
  const run = await $.process.run(['claude', 'plugin', 'list', '--json'])
  if (run.exitCode !== 0) throw new Error(run.stderr.trim() || 'claude plugin list failed')
  const list: { id: string; version: string; scope: string; enabled: boolean }[] = JSON.parse(
    run.stdout,
  )

  return list.map(p => ({ id: p.id, version: p.version, scope: p.scope, isOn: p.enabled }))
}

async function loadSkills($: EngineInterface): Promise<SkillRow[]> {
  const { context } = await $.session.usage({ breakdown: 'summary' })
  const listed = context.breakdown?.skills?.skillFrontmatter ?? []
  const settings = JSON.parse(await $.fs.read(await settingsPath($)))

  return mergeSkills(listed, settings.skillOverrides)
}

async function refresh($: EngineInterface) {
  const [p, s] = await Promise.allSettled([loadPlugins($), loadSkills($)])
  if (p.status === 'fulfilled') await update($, plugins, () => p.value)
  if (s.status === 'fulfilled') await update($, skills, () => s.value)
  const failed = [p, s].find(r => r.status === 'rejected')
  await say($, failed?.status === 'rejected' ? `Could not load: ${why(failed.reason)}` : '')
}

async function flipPlugin($: EngineInterface, p: PluginRow) {
  const verb = p.isOn ? 'disable' : 'enable'
  const run = await $.process.run(['claude', 'plugin', verb, p.id, '--scope', p.scope])
  await refresh($)
  await say(
    $,
    run.exitCode === 0
      ? `${p.id}: ${verb}d. Run /reload-plugins to apply it.`
      : `Not changed: ${(run.stderr || run.stdout).trim()}`,
  )
}

async function flipSkill($: EngineInterface, s: SkillRow) {
  try {
    const path = await settingsPath($)
    const before = await $.fs.read(path)
    const after = setSkill(before, s.key, !s.isOn)
    await $.fs.write(`${path}.bak-mod-switch`, before)
    await $.fs.write(path, after)
    await refresh($)
    await say($, `${s.key}: turned ${s.isOn ? 'off' : 'on'}.`)
  } catch (err) {
    await say($, `Not changed: ${why(err)}`)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mod-switch',
      description: 'List plugins and skills and switch each on or off',
    })

    return next(e)
  })

  on('command.run', { command: 'mod-switch' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Mods & skills', focus: true, closeOnEscape: true })

    return { text: 'Opened the mod-switch pane.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const which = await read($, tab)
    const message = await read($, note)
    const rows =
      which === 'plugins'
        ? (await read($, plugins)).map(p => ({
            key: `p:${p.id}:${p.scope}`,
            label: p.id,
            hint: p.version,
            isOn: p.isOn,
            flip: () => flipPlugin($, p),
          }))
        : (await read($, skills)).map(s => ({
            key: `s:${s.key}`,
            label: s.key,
            hint: s.source,
            isOn: s.isOn,
            flip: () => flipSkill($, s),
          }))
    const onCount = rows.filter(r => r.isOn).length

    return (
      <Box flexDirection="column">
        <Box>
          <Button
            key="tab-plugins"
            variant={which === 'plugins' ? 'primary' : undefined}
            onPress={() => update($, tab, () => 'plugins')}
          >
            Plugins
          </Button>
          <Button
            key="tab-skills"
            variant={which === 'skills' ? 'primary' : undefined}
            onPress={() => update($, tab, () => 'skills')}
          >
            Skills
          </Button>
          <Button key="refresh" onPress={() => refresh($)}>
            Refresh
          </Button>
        </Box>
        <Text dimColor>
          {onCount} on, {rows.length - onCount} off. Press ON or OFF to switch an item.
        </Text>
        {message !== '' && <Text>{message}</Text>}
        {rows.length === 0 && <Text dimColor>None found. Press Refresh.</Text>}
        {rows.map(r => (
          <Box gap={1}>
            <Box minWidth={7}>
              <Button
                key={r.key}
                variant={r.isOn ? 'primary' : undefined}
                dimColor={!r.isOn}
                onPress={r.flip}
              >
                {r.isOn ? 'ON' : 'OFF'}
              </Button>
            </Box>
            <Text dimColor={!r.isOn}>{r.label}</Text>
            <Text dimColor>{r.hint}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
