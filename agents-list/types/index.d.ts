export type AgentRow = {
  id: string
  name: string
  type: string
  description: string
  status: string
  parentId: string
}
export type AgentLast = { tool: string; detail: string; calls: number }
export type AgentBoard = { agents: AgentRow[]; last: Record<string, AgentLast> }

declare module 'claude-code' {
  interface PluginState {
    'agents-list': { board: AgentBoard }
  }
}
