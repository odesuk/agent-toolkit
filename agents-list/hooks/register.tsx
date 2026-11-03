import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentNote, AgentRow } from '../types'
import {
  blank,
  bump,
  detail,
  durationText,
  firstLine,
  order,
  stamp,
  statusOf,
  toRow,
} from './lib'

const PANE = 'agents-list'
const ref = { plugin: 'agents-list', key: 'board' } as const
const board = atom(ref, {
  agents: [],
  notes: {},
  main: { isRunning: false, task: '' },
  now: 0,
  note: '',
})

const why = (err: unknown) => (err instanceof Error ? err.message : String(err))
const say = ($: EngineInterface, text: string) => update($, board, old => ({ ...old, note: text }))

// A failed refresh must never hold up the agent whose event it watches.
const quietly = (work: Promise<unknown>) => work.catch(() => undefined)

// Reads the agent list and the clock, and stamps each agent's start and end.
// The main conversation is the first row, and the root of the agents it started.
async function refresh($: EngineInterface) {
  const [listed, now] = await Promise.all([$.agent.list(), $.clock.now()])
  await update($, board, old => {
    const main: AgentRow = {
      id: 'main',
      name: 'main',
      type: 'conversation',
      description: old.main.task,
      status: old.main.isRunning ? 'running' : 'idle',
      parentId: '',
    }
    const agents = [main, ...listed.map(toRow)]
    const notes: Record<string, AgentNote> = { ...old.notes }
    for (const a of agents) notes[a.id] = stamp(old.notes[a.id] ?? blank(), a.status, now)

    return { ...old, agents, notes, now }
  })
}

async function stopAgent($: EngineInterface, agent: AgentRow) {
  const name = agent.name || agent.type
  try {
    const run = await $.tool.call({ tool: 'TaskStop', task_id: agent.id })
    await refresh($)
    const said = run.deny ?? run.text ?? ''
    await say($, `${name}: ${run.deny !== undefined || run.isError ? 'not stopped.' : 'stop sent.'} ${said}`)
  } catch (err) {
    await say($, `${name}: not stopped. ${why(err)}`)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agents-list',
      description: 'List the agents of this session and what each one is doing',
    })
    // Run times grow by themselves, so read the clock while an agent runs.
    $.clock.every(5000, async () => {
      const { value } = await $.state.get(ref)
      if (value?.agents.some(a => a.id !== 'main' && a.status === 'running')) {
        await quietly(refresh($))
      }
    })

    return next(e)
  })

  on('command.run', { command: 'agents-list' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Agents', focus: true, closeOnEscape: true })

    return { text: 'Opened the agents-list pane.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    await quietly(refresh($))

    return spawned
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? 'main'
    const what = detail(e as unknown as Record<string, unknown>)
    await quietly(
      update($, board, old => ({
        ...old,
        notes: { ...old.notes, [id]: bump(old.notes[id], e.tool, what) },
      })),
    )

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    const task = firstLine(e.text)
    const id = e.agentId
    await quietly(
      update($, board, old => {
        if (id === undefined) {
          return { ...old, main: { isRunning: true, task: task || old.main.task } }
        }
        const was = old.notes[id] ?? blank()
        // The first prompt is the task; a later turn of the agent keeps it.
        const noted = was.task || !task ? was : { ...was, task }

        return { ...old, notes: { ...old.notes, [id]: noted } }
      }),
    )
    await quietly(refresh($))

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      await quietly(update($, board, old => ({ ...old, main: { ...old.main, isRunning: false } })))
    }
    await quietly(refresh($))

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { agents, notes, now, note } = await read($, board)
    const subs = agents.filter(a => a.id !== 'main')
    const running = subs.filter(a => a.status === 'running').length

    return (
      <Box flexDirection="column">
        <Box>
          <Button key="refresh" onPress={() => quietly(refresh($))}>
            Refresh
          </Button>
        </Box>
        <Text dimColor>
          {subs.length} agents, {running} running.
        </Text>
        {note !== '' && <Text>{note}</Text>}
        {subs.length === 0 && <Text dimColor>No agents in this session yet.</Text>}
        {order(agents).map(({ agent, depth }) => {
          const s = statusOf(agent.status)
          const seen = notes[agent.id]
          const verb = agent.status === 'running' ? 'now' : 'last'
          const isSub = agent.id !== 'main'
          const isActive = agent.status === 'running' || agent.status === 'waiting'
          // An idle agent has no run time: only a running or an ended agent has one.
          const span =
            isSub && seen && seen.start > 0 && (isActive || seen.end > 0)
              ? durationText((seen.end || now) - seen.start)
              : ''
          const canStop = isSub && isActive
          const call =
            seen && seen.calls > 0
              ? `${verb}: ${seen.tool} ${seen.detail} (${seen.calls} tool ${seen.calls === 1 ? 'call' : 'calls'})`
              : 'No tool call seen yet.'

          return (
            <Box flexDirection="column" marginLeft={depth * 2} marginBottom={1}>
              <Box gap={1}>
                <Text color={s.color}>{s.word}</Text>
                <Text weight="bold">{agent.name || agent.type}</Text>
                {agent.name !== '' && agent.name !== agent.type && (
                  <Text dimColor>{agent.type}</Text>
                )}
                {span !== '' && <Text dimColor>{span}</Text>}
                {canStop && (
                  <Button key={`stop:${agent.id}`} onPress={() => quietly(stopAgent($, agent))}>
                    Stop
                  </Button>
                )}
              </Box>
              {agent.description !== '' && <Text>{agent.description}</Text>}
              {seen && seen.task !== '' && seen.task !== agent.description && (
                <Text dimColor>{`task: ${seen.task}`}</Text>
              )}
              <Text dimColor>{call}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
