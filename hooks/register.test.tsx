import { expect, test } from 'claude-code/testing'

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
  '* \x1eabc1234\x1fHEAD -> main\x1ffirst commit\x1fdeliyami\x1f2 days ago',
  '|\\',
  '| * \x1edef5678\x1f\x1fside work\x1fdeliyami\x1f3 days ago',
].join('\n')

const SHOW = 'abc1234full\ndeliyami <me@example.com>\nMon Oct 12\n\n    first commit\n\n hooks/register.tsx | 3 ++-\n'

const fakeGit = (args: readonly string[]) => (args[1] === 'show' ? run(SHOW) : run(LOG))

test('the pane draws every commit with its refs, subject and author', async ($, on) => {
  on('process.run', (_$, e) => fakeGit(e.argv))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'git-graph', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /abc1234/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /HEAD -> main/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /side work · deliyami, 3 days ago/ })).toBeDefined()
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

test('the pane explains when git fails', async ($, on) => {
  on('process.run', () => run('', 128, 'fatal: not a git repository'))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'git-graph', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /not a git repository/ })).toBeDefined()
    await ui.unmount()
  }
})
