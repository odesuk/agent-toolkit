import { expect, test } from 'claude-code/testing'

import { detail, order, statusOf } from './lib'

const PANE = {
  plugin: 'agents-list',
  component: 'Pane',
  requestId: 'agents-list',
  props: {
    title: 'Agents',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const row = (id: string, parentId = '') => ({
  id,
  name: '',
  type: 't',
  description: id,
  status: 'running',
  parentId,
})

test('detail picks the argument that names the work, on one short line', () => {
  expect(detail({ command: 'ls\n  -la' })).toBe('ls -la')
  expect(detail({ file_path: '/a/b.ts', command: 'x' })).toBe('x')
  expect(detail({ other: 1 })).toBe('')
  expect(detail({ command: 'x'.repeat(100) })).toHaveLength(60)
})

test('order puts a child under its parent and keeps agents in a loop', () => {
  const ids = (rows: ReturnType<typeof order>) => rows.map(r => `${r.agent.id}:${r.depth}`)
  expect(ids(order([row('b', 'a'), row('a'), row('c', 'gone')]))).toEqual(['a:0', 'b:1', 'c:0'])
  expect(ids(order([row('x', 'y'), row('y', 'x')]))).toEqual(['x:0', 'y:1'])
})

test('statusOf names an unknown status as it is', () => {
  expect(statusOf('completed').word).toBe('done')
  expect(statusOf('new').word).toBe('new')
})

test('the pane shows an agent and the tool call it made, on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'agents-list' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.call', () => ({ result: {} }))
  on('agent.list', () => ({
    value: [
      { id: 'a1', type: 'Explore', description: 'find the usages', status: 'running' },
      { id: 'a2', type: 'Plan', description: 'plan it', status: 'idle', parentId: 'a1' },
    ],
  }))
  await $.command.run({ command: 'agents-list' })
  await $.tool.call({ tool: 'Bash', command: 'ls -la', agentId: 'a1' })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /find the usages/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /now: Bash ls -la \(1 tool call\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /No tool call seen yet/ })).toBeDefined()
    await ui.unmount()
  }
})
