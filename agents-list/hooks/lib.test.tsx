import { expect, mock, test } from 'claude-code/testing'

import { blank, bump, detail, durationText, firstLine, order, stamp, statusOf, toRow } from './lib'

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

test('firstLine keeps the first line and cuts a long one', () => {
  expect(firstLine('  Find the usages.\nThen report.  ')).toBe('Find the usages.')
  expect(firstLine('')).toBe('')
  expect(firstLine('y'.repeat(150))).toHaveLength(100)
})

test('order puts a child under its parent and keeps agents in a loop', () => {
  const ids = (rows: ReturnType<typeof order>) => rows.map(r => `${r.agent.id}:${r.depth}`)
  expect(ids(order([row('b', 'a'), row('a'), row('c', 'gone')]))).toEqual(['a:0', 'b:1', 'c:0'])
  expect(ids(order([row('x', 'y'), row('y', 'x')]))).toEqual(['x:0', 'y:1'])
  // An agent no other agent started stands under the main conversation.
  const rows = [row('main'), toRow({ ...row('a'), parentId: undefined })]
  expect(ids(order(rows))).toEqual(['main:0', 'a:1'])
})

test('statusOf names an unknown status as it is', () => {
  expect(statusOf('completed').word).toBe('done')
  expect(statusOf('new').word).toBe('new')
})

test('stamp sets the start once, and the end only while the agent is ended', () => {
  const first = stamp(blank(), 'running', 1000)
  expect([first.start, first.end]).toEqual([1000, 0])
  const later = stamp(first, 'running', 9000)
  expect(later).toBe(first)
  const done = stamp(first, 'completed', 5000)
  expect([done.start, done.end]).toEqual([1000, 5000])
  expect(stamp(done, 'completed', 9000).end).toBe(5000)
  expect(stamp(done, 'running', 9000).end).toBe(0)
})

test('bump counts a tool call and durationText spells a span', () => {
  const twice = bump(bump(undefined, 'Bash', 'ls'), 'Read', 'a.ts')
  expect([twice.tool, twice.detail, twice.calls]).toEqual(['Read', 'a.ts', 2])
  expect([4000, 65_000, 3_600_000 + 120_000].map(durationText)).toEqual(['4 s', '1 m 5 s', '1 h 2 m'])
})

test('the pane lists the main conversation, an agent, its run time and a Stop button', async ($, on) => {
  const stopped: unknown[] = []
  const clock = mock.clock(on, { now: 1000 })
  on('command.register', () => ({ value: { command: 'agents-list' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', (_, e) => {
    if (e.tool === 'TaskStop') stopped.push(e)

    return { result: {} }
  })
  on('agent.list', () => ({
    value: [
      { id: 'a1', type: 'Explore', description: 'find the usages', status: 'running' },
      { id: 'a2', type: 'Plan', description: 'plan it', status: 'idle', parentId: 'a1' },
    ],
  }))
  await $.turn.start({ text: 'fix the bug\nthen test it', turnId: 't1' })
  await $.turn.start({ text: 'Search the repo for weekly-usage', turnId: 't2', agentId: 'a1' })
  await $.command.run({ command: 'agents-list' })
  await $.tool.call({ tool: 'Bash', command: 'ls -la', agentId: 'a1' })
  await $.tool.call({ tool: 'Read', file_path: '/x/main.ts' })
  await clock.advance(65_000)
  await $.command.run({ command: 'agents-list' })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const has = async (text: RegExp) => (await ui.find({ type: 'Text', text })) !== undefined
    expect(await has(/2 agents, 1 running/)).toBe(true)
    expect(await has(/^fix the bug$/)).toBe(true)
    // The main turn has started and not ended, so its line says "now".
    expect(await has(/now: Read \/x\/main\.ts \(1 tool call\)/)).toBe(true)
    expect(await has(/find the usages/)).toBe(true)
    expect(await has(/task: Search the repo for weekly-usage/)).toBe(true)
    expect(await has(/now: Bash ls -la \(1 tool call\)/)).toBe(true)
    expect(await has(/1 m 5 s/)).toBe(true)
    expect(await has(/No tool call seen yet/)).toBe(true)
    // Only a running agent can be stopped: not the idle one, not the main row.
    expect(await ui.find({ type: 'Button', key: 'stop:a1' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'stop:a2' })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'stop:main' })).toBeUndefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'stop:a1' })
  expect(stopped).toMatchObject([{ tool: 'TaskStop', task_id: 'a1' }])
  expect(await ui.find({ type: 'Text', text: /Explore: stop sent/ })).toBeDefined()
  await ui.unmount()
})
