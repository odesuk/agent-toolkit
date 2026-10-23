export type PluginRow = { id: string; version: string; scope: string; isOn: boolean }
export type SkillRow = { key: string; source: string; isOn: boolean }

declare module 'claude-code' {
  interface PluginState {
    'mod-switch': {
      tab: 'plugins' | 'skills'
      plugins: PluginRow[]
      skills: SkillRow[]
      note: string
    }
  }
}
