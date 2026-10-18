import type { Register } from 'claude-code'

const PANE = 'git-graph'
const MAX_COMMITS = 300

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'git-graph',
      description: 'Show the git commit graph in a pane',
    })

    return next(e)
  })

  on('command.run', { command: 'git-graph' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Git Graph' })

    return { text: 'Git Graph pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)
    const { exitCode, stdout, stderr } = await $.process.run([
      'git',
      'log',
      '--graph',
      '--all',
      '--decorate',
      '--oneline',
      '--color=never',
      `--max-count=${MAX_COMMITS}`,
    ])

    if (exitCode !== 0) {
      return <Text dimColor>{stderr.trim() || 'Not a git repository.'}</Text>
    }

    const lines = stdout.split('\n').filter(line => line.length > 0)

    return (
      <Box flexDirection="column">
        {lines.length === 0 && <Text dimColor>No commits yet.</Text>}
        {lines.slice(0, room).map(line => (
          <Text>{line}</Text>
        ))}
      </Box>
    )
  })
}
