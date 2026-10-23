import { expect, mock, test } from 'claude-code/testing'

import { canSwitch, mergeSkills, setSkill } from './lib'

const PANE = {
  plugin: 'mod-switch',
  component: 'Pane',
  requestId: 'mod-switch',
  props: {
    title: 'Mods & skills',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('mergeSkills adds the skills the settings switch off, on last', () => {
  const rows = mergeSkills(
    [
      { name: 'zeta', source: 'userSettings' },
      { name: 'brief', source: 'plugin', pluginName: 'legal' },
    ],
    { 'legal:brief': 'off', 'finance:audit': 'off' },
  )

  expect(rows.map(r => `${r.key}=${r.isOn}`)).toEqual([
    'zeta=true',
    'finance:audit=false',
    'legal:brief=false',
  ])
})

test('canSwitch holds the scopes the claude CLI takes', () => {
  expect(['user', 'project', 'local'].map(canSwitch)).toEqual([true, true, true])
  expect(['session', 'synced'].map(canSwitch)).toEqual([false, false])
})

test('setSkill edits skillOverrides alone and keeps the rest', () => {
  const text = JSON.stringify({ model: 'opus', skillOverrides: { a: 'off' } }, null, 2) + '\n'
  const off = JSON.parse(setSkill(text, 'b', false))
  expect(off).toEqual({ model: 'opus', skillOverrides: { a: 'off', b: 'off' } })

  const none = JSON.parse(setSkill(setSkill(text, 'a', true), 'b', true))
  expect(none).toEqual({ model: 'opus' })
  expect(() => setSkill('{ not json', 'a', false)).toThrow()
})

test('the pane says when it has no rows, on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'mod-switch' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /None found/ })).toBeDefined()
    await ui.unmount()
  }
})

// The host side of the mod, answered from memory: what `claude` and the
// settings file would give, and a record of every call that changes something.
function host(on: Parameters<Parameters<typeof test>[1]>[1]) {
  const ran: string[][] = []
  const wrote: Record<string, string> = {}
  mock.env(on, { CLAUDE_CONFIG_DIR: '/cfg' })
  on('command.register', () => ({ value: { command: 'mod-switch' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      rateLimits: [],
      context: {
        window: 1,
        breakdown: {
          skills: { skillFrontmatter: [{ name: 'x', source: 'userSettings', tokens: 1 }] },
        },
      },
    } as never,
  }))
  on('fs.read', () => ({ value: '{ "model": "opus" }\n' }))
  on('fs.write', (_, e) => {
    wrote[e.path] = e.text

    return { value: undefined }
  })
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    const list = [
      { id: 'a@m', version: '1', scope: 'user', enabled: true },
      { id: 'b@m', version: '2', scope: 'user', enabled: false },
      { id: 'c@inline', version: '3', scope: 'session', enabled: true },
    ]

    return {
      value: { exitCode: 0, stdout: e.argv[2] === 'list' ? JSON.stringify(list) : '', stderr: '' },
    }
  })

  return { ran, wrote }
}

test('each row has an ON or OFF button that a press turns into a switch', async ($, on) => {
  const { ran } = host(on)
  await $.command.run({ command: 'mod-switch' })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Button', key: 'p:a@m:user' }))?.text).toBe('ON')
    expect((await ui.find({ type: 'Button', key: 'p:b@m:user' }))?.text).toBe('OFF')
    // The CLI refuses the session scope, so that row has no button to press.
    expect(await ui.find({ type: 'Button', key: 'p:c@inline:session' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /session plugin: cannot switch here/ })).toBeDefined()

    ran.length = 0
    await ui.press({ key: 'p:a@m:user' })
    await ui.press({ key: 'p:b@m:user' })
    expect(ran).toContainEqual(['claude', 'plugin', 'disable', 'a@m', '--scope', 'user'])
    expect(ran).toContainEqual(['claude', 'plugin', 'enable', 'b@m', '--scope', 'user'])
    await ui.unmount()
  }
})

test('pressing a skill button writes skillOverrides after a backup', async ($, on) => {
  const { wrote } = host(on)
  await $.command.run({ command: 'mod-switch' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-skills' })
  await ui.press({ key: 's:x' })

  // The test host may spell the path with a drive, so match the file name.
  const file = (name: string) => Object.entries(wrote).find(([path]) => path.endsWith(name))?.[1]
  expect(file('settings.json.bak-mod-switch')).toBe('{ "model": "opus" }\n')
  expect(JSON.parse(file('settings.json') ?? '{}')).toEqual({
    model: 'opus',
    skillOverrides: { x: 'off' },
  })
  await ui.unmount()
})
