import { expect, test } from 'claude-code/testing'

import { mergeSkills, setSkill } from './lib'

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

test('setSkill edits skillOverrides alone and keeps the rest', () => {
  const text = JSON.stringify({ model: 'opus', skillOverrides: { a: 'off' } }, null, 2) + '\n'
  const off = JSON.parse(setSkill(text, 'b', false))
  expect(off).toEqual({ model: 'opus', skillOverrides: { a: 'off', b: 'off' } })

  const none = JSON.parse(setSkill(setSkill(text, 'a', true), 'b', true))
  expect(none).toEqual({ model: 'opus' })
  expect(() => setSkill('{ not json', 'a', false)).toThrow()
})

test('the pane lists a skill on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'mod-switch' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /None found/ })).toBeDefined()
    await ui.unmount()
  }
})
