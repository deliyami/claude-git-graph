import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import { buildHtml } from './html'
import type { Details } from './html'
import { layout } from './layout'
import type { Cell, Commit, GraphRow } from './layout'

const PANE = 'git-graph'
const MAX_COMMITS = 300
const FIELD = '\x1f'
const RECORD = '\x1e'
const LANE_COLORS: Color[] = ['ide', 'claude', 'success', 'warning', 'merged', 'permission', 'suggestion', 'error']

const selected = atom({ plugin: 'git-graph', key: 'selected' } as const, null)

const laneColor = (n: number) => LANE_COLORS[n % LANE_COLORS.length]!

const parseLog = (stdout: string): Commit[] =>
  stdout
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      const [hash = '', parents = '', refs = '', subject = '', author = '', date = ''] = line.split(FIELD)
      return { hash, parents: parents.split(' ').filter(Boolean), refs, subject, author, date }
    })

// `%D` as chips: "HEAD -> main, origin/main, tag: v1" becomes main (HEAD), origin/main, v1 (tag).
const parseRefs = (refs: string) =>
  refs
    .split(', ')
    .filter(Boolean)
    .map(ref =>
      ref.startsWith('HEAD -> ')
        ? { name: ref.slice('HEAD -> '.length), isHead: true, isTag: false }
        : ref.startsWith('tag: ')
          ? { name: ref.slice('tag: '.length), isHead: false, isTag: true }
          : { name: ref, isHead: ref === 'HEAD', isTag: false },
    )

type Graph = { error: string } | { error?: undefined; commits: Commit[]; changed: number; rows: GraphRow[] }

const loadGraph = async ($: EngineInterface): Promise<Graph> => {
  const log = await $.process.run([
    'git',
    'log',
    '--all',
    '--date-order',
    '--color=never',
    `--max-count=${MAX_COMMITS}`,
    `--format=%h${FIELD}%p${FIELD}%D${FIELD}%s${FIELD}%an${FIELD}%ar`,
  ])
  if (log.exitCode !== 0) return { error: log.stderr.trim() || 'Not a git repository.' }

  const commits = parseLog(log.stdout)
  const [status, head] = await Promise.all([
    $.process.run(['git', 'status', '--porcelain']),
    $.process.run(['git', 'rev-parse', '--short', 'HEAD']),
  ])
  const changed = status.stdout.split('\n').filter(Boolean).length

  return { commits, changed, rows: layout(commits, changed > 0 ? head.stdout.trim() : null) }
}

// One page per repository, overwritten on every open: an open tab picks up the new graph on reload and old pages
// never pile up. The path's hash keeps two repositories with the same folder name apart.
const pagePath = async ($: EngineInterface, top: string) => {
  const tmp = ((await $.env.get('TMPDIR')) || '/tmp').replace(/\/+$/, '')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(top)))
  const id = [...digest.slice(0, 4)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${tmp}/git-graph/${top.split('/').pop() || 'repo'}-${id}.html`
}

// Inside Orca the page opens in its built-in browser: the tab showing it already is reloaded and brought forward,
// otherwise a new one is made. False when this is not Orca or its CLI fails, so the system browser takes over.
const openInOrca = async ($: EngineInterface, url: string) => {
  if ((await $.env.get('TERM_PROGRAM')) !== 'Orca') return false
  const bin = await $.env.get('ORCA_CLI_BIN_DIR')
  const orca = bin ? `${bin}/orca` : 'orca'

  try {
    const list = await $.process.run([orca, 'tab', 'list', '--json'])
    const tabs: { browserPageId: string; url: string }[] =
      list.exitCode === 0 ? (JSON.parse(list.stdout).result?.tabs ?? []) : []
    const tab = tabs.find(one => one.url === url)
    if (!tab) return (await $.process.run([orca, 'tab', 'create', '--url', url])).exitCode === 0

    const page = tab.browserPageId
    const shown = await $.process.run([orca, 'goto', '--page', page, '--url', url])
    await $.process.run([orca, 'tab', 'switch', '--page', page, '--focus'])
    return shown.exitCode === 0
  } catch {
    return false
  }
}

// Writes the graph as an SVG page and opens it, in Orca's browser when running there, else the default browser.
const openInBrowser = async ($: EngineInterface) => {
  const graph = await loadGraph($)
  if (graph.error !== undefined) return $.ui.toast(graph.error)

  const [log, top] = await Promise.all([
    $.process.run([
      'git',
      'log',
      '--all',
      '--date-order',
      '--date=iso',
      `--max-count=${MAX_COMMITS}`,
      `--format=%h${FIELD}%H${FIELD}%ae${FIELD}%ad${FIELD}%b${RECORD}`,
    ]),
    $.process.run(['git', 'rev-parse', '--show-toplevel']),
  ])
  const details: Record<string, Details> = Object.fromEntries(
    log.stdout.split(RECORD).flatMap(record => {
      const [hash = '', full = '', email = '', when = '', body = ''] = record.replace(/^\n/, '').split(FIELD)
      return hash ? [[hash, { full, email, when, body: body.trim() }]] : []
    }),
  )

  const root = top.stdout.trim()
  const title = root.split('/').pop() || 'Git Graph'
  const file = await pagePath($, root)
  await $.fs.write(file, buildHtml(title, graph.rows, details, graph.changed))

  if (await openInOrca($, `file://${encodeURI(file)}`)) return $.ui.toast('Git Graph opened in an Orca tab.')

  const opened = await $.process.run(['open', file])
  if (opened.exitCode !== 0) await $.process.run(['xdg-open', file])
  $.ui.toast('Git Graph opened in your browser.')
}

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
    const loaded = await loadGraph($)
    if (loaded.error !== undefined) return <Text dimColor>{loaded.error}</Text>
    if (loaded.commits.length === 0) return <Text dimColor>No commits yet.</Text>

    const { rows, changed } = loaded
    const open = await read($, selected)
    const details = open
      ? await $.process.run(['git', 'show', '--stat', '--color=never', '--format=%H%n%an <%ae>%n%ad%n%n%B', open])
      : undefined

    const graph = (cells: Cell[]) =>
      cells.flatMap(cell => [
        cell.glyph === ' ' ? ' ' : <Text color={laneColor(cell.color)}>{cell.glyph}</Text>,
        cell.link === ' ' ? ' ' : <Text color={laneColor(cell.linkColor)}>{cell.link}</Text>,
      ])

    return (
      <Box flexDirection="column">
        <Box>
          <Button hotkey="o" onPress={() => openInBrowser($)}>
            Open in browser
          </Button>
        </Box>
        {rows.map(row =>
          row.commit === null ? (
            <Text>
              {graph(row.cells)} <Text italic dimColor>Uncommitted changes ({changed})</Text>
            </Text>
          ) : (
            <Box flexDirection="column">
              <Button
                key={row.commit.hash}
                plain
                onPress={() => {
                  const hash = row.commit!.hash
                  return update($, selected, current => (current === hash ? null : hash))
                }}
              >
                {graph(row.cells)}{' '}
                {parseRefs(row.commit.refs).map(ref => (
                  <Text color={laneColor(row.color)} inverse bold={ref.isHead}>
                    {' '}
                    {ref.isTag ? '◆' : '⎇'} {ref.name}
                    {ref.isHead ? ' ✓' : ''}{' '}
                  </Text>
                ))}
                {row.commit.refs && ' '}
                {row.commit.subject}{' '}
                <Text dimColor>
                  {row.commit.author} · {row.commit.date} · {row.commit.hash}
                </Text>
              </Button>
              {open === row.commit.hash && details && (
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
