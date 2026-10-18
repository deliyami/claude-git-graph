export type SelectedCommit = string | null

// The browser page being made: which step of three, its label, and the spinner's frame.
export type Opening = { step: number; label: string; frame: number } | null

declare module 'claude-code' {
  interface PluginState {
    'git-graph': { selected: SelectedCommit; opening: Opening }
  }
}
