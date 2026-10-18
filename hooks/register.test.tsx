import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'git-graph',
  props: {
    title: 'Git Graph',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const run = (stdout: string, exitCode = 0, stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

const LOG = [
  'abc1234\x1fdef5678\x1fHEAD -> main\x1ffirst commit\x1fdeliyami\x1f2 days ago',
  'def5678\x1f\x1f\x1fside work\x1fdeliyami\x1f3 days ago',
].join('\n')

const SHOW = 'abc1234full\ndeliyami <me@example.com>\nMon Oct 12\n\n    first commit\n\n hooks/register.tsx | 3 ++-\n'

const fakeGit = (args: readonly string[]) =>
  args[1] === 'show'
      ? run(SHOW)
      : args[1] === 'status'
        ? run(' M README.md\n')
        : args[1] === 'rev-parse'
          ? run(args[2] === '--show-toplevel' ? '/work/my-repo\n' : 'abc1234\n')
          : args.some(arg => arg.startsWith('--format=%h\x1f%H'))
            ? run('abc1234\x1fabc1234full\x1fme@example.com\x1f2026-10-12\x1fbody text\x1e')
            : run(LOG)

test('the pane draws every commit with its branch chip, subject and author', async ($, on) => {
  on('process.run', (_$, e) => fakeGit(e.argv))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'git-graph', surface, ...PANE })
    expect(await ui.find({ type: 'Button', text: /⎇ main ✓.*first commit/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /side work deliyami · 3 days ago · def5678/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Uncommitted changes \(1\)/ })).toBeDefined()
    await ui.unmount()
  }
})

test('pressing a commit opens its details, pressing again closes them', async ($, on) => {
  on('process.run', (_$, e) => fakeGit(e.argv))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'git-graph', surface, ...PANE })
    await ui.press({ key: 'abc1234' })
    expect(await ui.find({ type: 'Text', text: /hooks\/register\.tsx/ })).toBeDefined()
    await ui.press({ key: 'abc1234' })
    expect(await ui.find({ type: 'Text', text: /hooks\/register\.tsx/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('the browser button writes an SVG graph page and opens it', async ($, on) => {
  mock.clock(on)
  const opened: string[][] = []
  const written: { path: string; text: string }[] = []
  on('process.run', (_$, e) => {
    if (e.argv[0] === 'open') opened.push([...e.argv])
    return fakeGit(e.argv)
  })
  on('env.get', (_$, e) => ({ value: e.name === 'TMPDIR' ? '/tmp/' : undefined }))
  on('fs.write', (_$, e) => {
    written.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    opened.length = 0
    written.length = 0
    const ui = await $.ui.mount({ plugin: 'git-graph', surface, ...PANE })
    await ui.press({ key: 'Open in browser' })
    await ui.press({ key: 'Open in browser' })
    expect(written[1]?.path).toBe(written[0]?.path)
    expect(written[0]?.path).toMatch(/^\/tmp\/git-graph\/my-repo-[0-9a-f]{8}\.html$/)
    expect(written[0]?.text).toContain('<svg class="graph"')
    expect(written[0]?.text).toContain('my-repo')
    expect(written[0]?.text).toContain('body text')
    expect(opened).toEqual([
      ['open', written[0]!.path],
      ['open', written[0]!.path],
    ])
    await ui.unmount()
  }
})

test('inside Orca the page opens in an Orca tab, reusing the one already showing it', async ($, on) => {
  mock.clock(on)
  const orca: string[][] = []
  let tabs: { browserPageId: string; url: string }[] = []
  on('env.get', (_$, e) => ({
    value: e.name === 'TMPDIR' ? '/tmp' : e.name === 'TERM_PROGRAM' ? 'Orca' : e.name === 'ORCA_CLI_BIN_DIR' ? '/orca/bin' : undefined,
  }))
  on('fs.write', () => ({ value: undefined }))
  on('process.run', (_$, e) => {
    if (e.argv[0] !== '/orca/bin/orca') return fakeGit(e.argv)
    orca.push(e.argv.slice(1))
    if (e.argv[2] === 'list') return run(JSON.stringify({ ok: true, result: { tabs } }))
    if (e.argv[2] === 'create') tabs = [{ browserPageId: 'p1', url: e.argv[4]! }]
    return run('{}')
  })
  const ui = await $.ui.mount({ plugin: 'git-graph', surface: 'terminal', ...PANE })
  await ui.press({ key: 'Open in browser' })
  await ui.press({ key: 'Open in browser' })
  const url = tabs[0]!.url
  expect(url).toMatch(/^file:\/\/\/tmp\/git-graph\/my-repo-[0-9a-f]{8}\.html$/)
  expect(orca).toEqual([
    ['tab', 'list', '--json'],
    ['tab', 'create', '--url', url],
    ['tab', 'list', '--json'],
    ['goto', '--page', 'p1', '--url', url],
    ['tab', 'switch', '--page', 'p1', '--focus'],
  ])
  await ui.unmount()
})

test('a slow open shows a spinner and its step until the page is open', async ($, on) => {
  const clock = mock.clock(on)
  on('env.get', (_$, e) => ({
    value: e.name === 'TMPDIR' ? '/tmp' : e.name === 'TERM_PROGRAM' ? 'Orca' : e.name === 'ORCA_CLI_BIN_DIR' ? '/orca/bin' : undefined,
  }))
  on('fs.write', () => ({ value: undefined }))
  on('process.run', async (_$, e) => {
    if (e.argv[0] !== '/orca/bin/orca') return fakeGit(e.argv)
    await clock.sleep(3000)
    return run(JSON.stringify({ ok: true, result: { tabs: [] } }))
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'git-graph', surface, ...PANE })
    const pressed = ui.press({ key: 'Open in browser' })
    await clock.advance(250)
    expect(await ui.find({ type: 'Text', text: /Opening tab… ▰▰▰ 3\/3/ })).toBeDefined()
    await clock.advance(6000)
    await pressed
    expect(await ui.find({ type: 'Text', text: /Opening tab/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('the pane explains when git fails', async ($, on) => {
  on('process.run', () => run('', 128, 'fatal: not a git repository'))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'git-graph', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /not a git repository/ })).toBeDefined()
    await ui.unmount()
  }
})
