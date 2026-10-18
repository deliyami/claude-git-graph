import { expect, test } from 'claude-code/testing'

import { layout } from './layout'
import type { Commit } from './layout'

const commit = (hash: string, ...parents: string[]): Commit => ({
  hash,
  parents,
  refs: '',
  subject: hash,
  author: 'a',
  date: 'now',
})

const draw = (dirty: string | null, ...commits: Commit[]) =>
  layout(commits, dirty).map(row =>
    row.cells
      .map(cell => cell.glyph + cell.link)
      .join('')
      .trimEnd(),
  )

test('a branch forks off and merges back in its own lane', () => {
  expect(draw(null, commit('m', 'c', 'f'), commit('f', 'b'), commit('c', 'b'), commit('b', 'a'), commit('a'))).toEqual([
    '●─╮',
    '│ ●',
    '● │',
    '●─╯',
    '●',
  ])
})

test('a lane that ends where another starts is drawn as one tee', () => {
  expect(draw(null, commit('x', 'm'), commit('w', 'm'), commit('m', 'b', 'f'), commit('f', 'b'), commit('b'))).toEqual([
    '●',
    '│ ●',
    '●─┤',
    '│ ●',
    '●─╯',
  ])
})

test('uncommitted changes sit above HEAD in its lane', () => {
  expect(draw('b', commit('b', 'a'), commit('a'))).toEqual(['○', '●', '●'])
})
