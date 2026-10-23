import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentLast } from '../types'
import { detail, order, statusOf, toRow } from './lib'

const PANE = 'agents-list'
const board = atom({ plugin: 'agents-list', key: 'board' } as const, { agents: [], last: {} })

// Reads the agent list. `seen` adds one tool call to what that agent did last.
// The calls counted are the ones seen since this mod loaded.
async function refresh($: EngineInterface, seen?: { id: string; tool: string; detail: string }) {
  const agents = (await $.agent.list()).map(toRow)
  await update($, board, old => {
    const last: Record<string, AgentLast> = {}
    for (const a of agents) {
      const was = old.last[a.id]
      if (was) last[a.id] = was
    }
    if (seen) {
      const calls = (old.last[seen.id]?.calls ?? 0) + 1
      last[seen.id] = { tool: seen.tool, detail: seen.detail, calls }
    }

    return { agents, last }
  })
}

// A failed refresh must never hold up the agent whose event it watches.
const quietly = (work: Promise<void>) => work.catch(() => undefined)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agents-list',
      description: 'List the agents of this session and what each one is doing',
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
    if (e.agentId !== undefined) {
      const input = e as unknown as Record<string, unknown>
      await quietly(refresh($, { id: e.agentId, tool: e.tool, detail: detail(input) }))
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await quietly(refresh($))

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { agents, last } = await read($, board)
    const running = agents.filter(a => a.status === 'running').length

    return (
      <Box flexDirection="column">
        <Box>
          <Button key="refresh" onPress={() => quietly(refresh($))}>
            Refresh
          </Button>
        </Box>
        <Text dimColor>
          {agents.length} agents, {running} running.
        </Text>
        {agents.length === 0 && <Text dimColor>No agents in this session yet.</Text>}
        {order(agents).map(({ agent, depth }) => {
          const s = statusOf(agent.status)
          const seen = last[agent.id]
          const verb = agent.status === 'running' ? 'now' : 'last'

          return (
            <Box flexDirection="column" marginLeft={depth * 2} marginBottom={1}>
              <Box gap={1}>
                <Text color={s.color}>{s.word}</Text>
                <Text weight="bold">{agent.name || agent.type}</Text>
                {agent.name !== '' && <Text dimColor>{agent.type}</Text>}
              </Box>
              <Text>{agent.description}</Text>
              <Text dimColor>
                {seen
                  ? `${verb}: ${seen.tool} ${seen.detail} (${seen.calls} tool ${seen.calls === 1 ? 'call' : 'calls'})`
                  : 'No tool call seen yet.'}
              </Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
