export type WeekView = {
  percentUsed: number | null
  resetsAt: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'weekly-usage': { week: WeekView | null }
  }
}
