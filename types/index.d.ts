export type SelectedCommit = string | null

declare module 'claude-code' {
  interface PluginState {
    'git-graph': { selected: SelectedCommit }
  }
}
