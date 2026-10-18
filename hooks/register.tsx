import { atom, read, update } from 'claude-code'
import type { Color, Register } from 'claude-code'

const PANE = 'git-graph'
const MAX_COMMITS = 300
const FIELD = '\x1f'
const START = '\x1e'
const LANE_COLORS: Color[] = ['claude', 'suggestion', 'success', 'warning', 'merged', 'permission', 'ide', 'error']

const selected = atom({ plugin: 'git-graph', key: 'selected' } as const, null)

type Row =
  | { kind: 'graph'; graph: string }
  | { kind: 'commit'; graph: string; hash: string; refs: string; subject: string; author: string; date: string }

const parseLog = (stdout: string): Row[] =>
  stdout
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      const at = line.indexOf(START)
      if (at < 0) return { kind: 'graph', graph: line }
      const [hash = '', refs = '', subject = '', author = '', date = ''] = line.slice(at + 1).split(FIELD)
      return { kind: 'commit', graph: line.slice(0, at), hash, refs: refs.trim(), subject, author, date }
    })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'git-graph',
      description: 'Show the git commit graph in a pane',
    })

    return next(e)
  })

  on('command.run', { command: 'git-graph' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Git Graph', focus: true, closeOnEscape: true })

    return { text: 'Git Graph pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const { exitCode, stdout, stderr } = await $.process.run([
      'git',
      'log',
      '--graph',
      '--all',
      '--color=never',
      `--max-count=${MAX_COMMITS}`,
      `--format=${START}%h${FIELD}%D${FIELD}%s${FIELD}%an${FIELD}%ar`,
    ])

    if (exitCode !== 0) {
      return <Text dimColor>{stderr.trim() || 'Not a git repository.'}</Text>
    }

    const rows = parseLog(stdout)
    const open = await read($, selected)
    const details = open ? await $.process.run(['git', 'show', '--stat', '--color=never', '--format=%H%n%an <%ae>%n%ad%n%n%B', open]) : undefined

    // Each graph column pair is one lane; color it so branches can be followed.
    const graph = (text: string) =>
      [...text].map((char, i) =>
        char === '*' ? (
          <Text bold>{char}</Text>
        ) : char === ' ' ? (
          char
        ) : (
          <Text color={LANE_COLORS[Math.floor(i / 2) % LANE_COLORS.length]}>{char}</Text>
        ),
      )

    return (
      <Box flexDirection="column">
        {rows.length === 0 && <Text dimColor>No commits yet.</Text>}
        {rows.map(row =>
          row.kind === 'graph' ? (
            <Text>{graph(row.graph)}</Text>
          ) : (
            <Box flexDirection="column">
              <Button
                key={row.hash}
                plain
                onPress={() => update($, selected, current => (current === row.hash ? null : row.hash))}
              >
                {graph(row.graph)}
                <Text color="warning">{row.hash}</Text>{' '}
                {row.refs && <Text color="success" bold>({row.refs}) </Text>}
                {row.subject} <Text dimColor>· {row.author}, {row.date}</Text>
              </Button>
              {open === row.hash && details && (
                <Box flexDirection="column" borderStyle="round" paddingX={1}>
                  {details.stdout
                    .trimEnd()
                    .split('\n')
                    .map(line => (
                      <Text dimColor={/^ \S.*\|/.test(line)}>{line}</Text>
                    ))}
                </Box>
              )}
            </Box>
          ),
        )}
      </Box>
    )
  })
}
