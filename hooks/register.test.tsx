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

const gitLog = (stdout: string, exitCode = 0, stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

test('the pane draws git log --graph output', async ($, on) => {
  on('process.run', () => gitLog('* abc1234 (HEAD -> main) first commit\n'))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'git-graph', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /abc1234 \(HEAD -> main\) first commit/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the pane explains when git fails', async ($, on) => {
  on('process.run', () => gitLog('', 128, 'fatal: not a git repository'))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'git-graph', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /not a git repository/ })).toBeDefined()
    await ui.unmount()
  }
})
