export type AgentRow = {
  id: string
  name: string
  type: string
  description: string
  status: string
  parentId: string
}
// `start` and `end` are in milliseconds; 0 means not known yet, or not ended.
export type AgentNote = {
  tool: string
  detail: string
  calls: number
  task: string
  start: number
  end: number
}
export type AgentBoard = {
  agents: AgentRow[]
  notes: Record<string, AgentNote>
  main: { isRunning: boolean; task: string }
  now: number
  note: string
}

declare module 'claude-code' {
  interface PluginState {
    'agents-list': { board: AgentBoard }
  }
}
