import type { AgentNote, AgentRow } from '../types'

type Info = {
  id: string
  name?: string
  type: string
  description: string
  status: string
  parentId?: string
}

// An agent that no other agent started was started from the main conversation.
export const toRow = (a: Info): AgentRow => ({
  id: a.id,
  name: a.name ?? '',
  type: a.type,
  description: a.description,
  status: a.status,
  parentId: a.parentId ?? 'main',
})

export const blank = (): AgentNote => ({ tool: '', detail: '', calls: 0, task: '', start: 0, end: 0 })

export function firstLine(text: string, max = 100): string {
  const line = text.trim().split('\n')[0]?.trim() ?? ''

  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

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

  return typeof value === 'string' ? firstLine(value.replace(/\s+/g, ' '), 60) : ''
}

export const bump = (note: AgentNote | undefined, tool: string, what: string): AgentNote => {
  const was = note ?? blank()

  return { ...was, tool, detail: what, calls: was.calls + 1 }
}

const ENDED = new Set(['completed', 'failed', 'killed'])

// Sets the start time the first time an agent is seen, and the end time the
// first time it is seen ended. An agent that runs again has no end time.
export function stamp(note: AgentNote, status: string, now: number): AgentNote {
  const start = note.start || now
  const end = ENDED.has(status) ? note.end || now : 0

  return start === note.start && end === note.end ? note : { ...note, start, end }
}

export function durationText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)

  return m < 60 ? `${m} m ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} m`
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
