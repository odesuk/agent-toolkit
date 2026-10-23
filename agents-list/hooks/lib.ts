import type { AgentRow } from '../types'

type Info = {
  id: string
  name?: string
  type: string
  description: string
  status: string
  parentId?: string
}

export const toRow = (a: Info): AgentRow => ({
  id: a.id,
  name: a.name ?? '',
  type: a.type,
  description: a.description,
  status: a.status,
  parentId: a.parentId ?? '',
})

// One short line for what a tool call works on, from its arguments.
export function detail(input: Record<string, unknown>): string {
  const value =
    input.command ??
    input.file_path ??
    input.pattern ??
    input.path ??
    input.url ??
    input.description ??
    input.prompt
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''

  return text.length > 60 ? `${text.slice(0, 59)}…` : text
}

// Children follow their parent. An agent whose parent is gone stands as a root.
export function order(agents: readonly AgentRow[]): { agent: AgentRow; depth: number }[] {
  const ids = new Set(agents.map(a => a.id))
  const seen = new Set<string>()
  const out: { agent: AgentRow; depth: number }[] = []
  const add = (agent: AgentRow, depth: number) => {
    if (seen.has(agent.id)) return
    seen.add(agent.id)
    out.push({ agent, depth })
    for (const child of agents) if (child.parentId === agent.id) add(child, depth + 1)
  }
  for (const a of agents) if (!ids.has(a.parentId)) add(a, 0)
  // Agents that name each other as parent have no root; show them anyway.
  for (const a of agents) add(a, 0)

  return out
}

const STATUS: Record<string, { word: string; color: string }> = {
  pending: { word: 'pending', color: 'inactive' },
  running: { word: 'running', color: 'success' },
  waiting: { word: 'waiting', color: 'warning' },
  idle: { word: 'idle', color: 'inactive' },
  completed: { word: 'done', color: 'inactive' },
  failed: { word: 'failed', color: 'error' },
  killed: { word: 'stopped', color: 'inactive' },
}

export const statusOf = (status: string) => STATUS[status] ?? { word: status, color: 'inactive' }
