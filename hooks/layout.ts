export type Commit = {
  hash: string
  parents: string[]
  refs: string
  subject: string
  author: string
  date: string
}

// One lane column: its glyph and the connector drawn to its right, each with the lane color it belongs to.
export type Cell = { glyph: string; color: number; link: string; linkColor: number }

// A line leaving this row downward: it starts at lane `from` (the commit's own lane for a fork or a merge) and runs in
// lane `lane` until the commit it waits for, `hash`.
export type Segment = { from: number; lane: number; hash: string; color: number }

export type GraphRow = { cells: Cell[]; col: number; color: number; commit: Commit | null; segments: Segment[] }

type Lane = { hash: string; color: number } | null

const TEES: Record<string, string> = { '╯╮': '┤', '╰╭': '├' }

const blank = (): Cell => ({ glyph: ' ', color: 0, link: ' ', linkColor: 0 })

// Assigns every commit a lane, newest first, the way VS Code's Git Graph does: a branch keeps its lane and color
// from its tip down, forks and merges are drawn as curves into the neighbouring lane.
export const layout = (commits: Commit[], dirtyHead: string | null): GraphRow[] => {
  const lanes: Lane[] = []
  let colors = 0
  const rows: GraphRow[] = []

  const alloc = (hash: string) => {
    const free = lanes.indexOf(null)
    const at = free < 0 ? lanes.length : free
    lanes[at] = { hash, color: colors++ }
    return at
  }

  const startRow = () =>
    lanes.map(lane => (lane ? { glyph: '│', color: lane.color, link: ' ', linkColor: 0 } : blank()))

  const cellAt = (cells: Cell[], i: number) => {
    while (cells.length <= i) cells.push(blank())
    return cells[i]!
  }

  const join = (cells: Cell[], from: number, to: number, glyph: string, color: number) => {
    const [lo, hi] = from < to ? [from, to] : [to, from]
    for (let i = lo; i < hi; i++) {
      const cell = cellAt(cells, i)
      cell.link = '─'
      cell.linkColor = color
      if (i > lo && cell.glyph === ' ') cell.glyph = '─'
      if (i > lo && cell.glyph === '─') cell.color = color
    }
    // A lane ending here and a new one starting in the same column read as one tee.
    const end = cellAt(cells, to)
    end.glyph = TEES[end.glyph + glyph] ?? glyph
    end.color = color
  }

  if (dirtyHead) {
    const at = alloc(dirtyHead)
    const cells = startRow()
    cells[at] = { glyph: '○', color: lanes[at]!.color, link: ' ', linkColor: 0 }
    const color = lanes[at]!.color
    rows.push({ cells, col: at, color, commit: null, segments: [{ from: at, lane: at, hash: dirtyHead, color }] })
  }

  for (const commit of commits) {
    let col = lanes.findIndex(lane => lane?.hash === commit.hash)
    if (col < 0) col = alloc(commit.hash)
    const color = lanes[col]!.color
    const cells = startRow()
    cells[col] = { glyph: '●', color, link: ' ', linkColor: 0 }

    lanes.forEach((lane, j) => {
      if (j === col || lane?.hash !== commit.hash) return
      join(cells, col, j, j > col ? '╯' : '╰', lane.color)
      lanes[j] = null
    })

    const [first, ...rest] = commit.parents
    lanes[col] = first ? { hash: first, color } : null
    const forks = new Set([col])
    const merges: Segment[] = []

    for (const parent of rest) {
      const joined = lanes.findIndex(lane => lane?.hash === parent)
      if (joined >= 0) {
        join(cells, col, joined, joined > col ? '┤' : '├', lanes[joined]!.color)
        merges.push({ from: col, lane: joined, hash: parent, color: lanes[joined]!.color })
      } else {
        const k = alloc(parent)
        join(cells, col, k, k > col ? '╮' : '╭', lanes[k]!.color)
        forks.add(k)
      }
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()
    const segments = lanes.flatMap((lane, i) =>
      lane ? [{ from: forks.has(i) ? col : i, lane: i, hash: lane.hash, color: lane.color }] : [],
    )
    rows.push({ cells, col, color, commit, segments: [...segments, ...merges] })
  }

  return rows
}
