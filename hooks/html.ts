import type { GraphRow } from './layout'

const ROW = 28
const LANE = 16
const PAD = 14
// VS Code Git Graph's default branch colors.
const COLORS = ['#0085d9', '#d9008f', '#00d90a', '#d98500', '#a300d9', '#ff0000', '#00d9cc', '#e138e8']

const color = (n: number) => COLORS[n % COLORS.length]!
const x = (lane: number) => PAD + lane * LANE
const y = (row: number) => row * ROW + ROW / 2

const escape = (text: string) =>
  text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)

const parseRefs = (refs: string) =>
  refs
    .split(', ')
    .filter(Boolean)
    .map(ref =>
      ref.startsWith('HEAD -> ')
        ? { name: ref.slice('HEAD -> '.length), kind: 'head' }
        : ref.startsWith('tag: ')
          ? { name: ref.slice('tag: '.length), kind: 'tag' }
          : { name: ref, kind: ref.includes('/') ? 'remote' : 'branch' },
    )

const svg = (rows: GraphRow[]) => {
  const lanes = Math.max(1, ...rows.flatMap(row => [row.col, ...row.segments.map(seg => seg.lane)]).map(n => n + 1))
  const width = x(lanes - 1) + PAD
  const height = rows.length * ROW

  const lines = rows.flatMap((row, r) =>
    row.segments.map(seg => {
      const next = rows[r + 1]
      const end = next?.commit && seg.hash === next.commit.hash ? next.col : seg.lane
      const [x1, y1, x2, y2] = [x(seg.from), y(r), x(end), next ? y(r + 1) : y(r) + ROW]
      const mid = (y1 + y2) / 2
      const d = x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`
      return `<path d="${d}" stroke="${color(seg.color)}"/>`
    }),
  )

  const nodes = rows.map((row, r) =>
    row.commit
      ? `<circle cx="${x(row.col)}" cy="${y(r)}" r="5" fill="${color(row.color)}"/>`
      : `<circle class="dirty" cx="${x(row.col)}" cy="${y(r)}" r="5" stroke="${color(row.color)}"/>`,
  )

  return {
    width,
    markup: `<svg class="graph" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${lines.join('')}${nodes.join('')}</svg>`,
  }
}

export type Details = { full: string; email: string; when: string; body: string }

export const buildHtml = (title: string, rows: GraphRow[], details: Record<string, Details>, changed: number) => {
  const graph = svg(rows)

  const items = rows.map(row => {
    if (!row.commit) {
      return `<div class="row dirty-row"><span class="subject">Uncommitted changes (${changed})</span></div>`
    }
    const { hash, refs, subject, author, date } = row.commit
    const chips = parseRefs(refs)
      .map(
        ref =>
          `<span class="chip ${ref.kind}" style="--c:${color(row.color)}"><span class="icon">${ref.kind === 'tag' ? '◆' : '⎇'}</span>${escape(ref.name)}${ref.kind === 'head' ? ' ✓' : ''}</span>`,
      )
      .join('')
    return `<div class="row" data-hash="${escape(hash)}">${chips}<span class="subject">${escape(subject)}</span><span class="meta">${escape(author)}</span><span class="meta">${escape(date)}</span><span class="hash">${escape(hash)}</span></div>`
  })

  // `<` escaped so a commit message cannot close the script element.
  const data = JSON.stringify(
    Object.fromEntries(
      rows.flatMap(row => (row.commit ? [[row.commit.hash, { ...row.commit, ...details[row.commit.hash] }]] : [])),
    ),
  ).replace(/</g, '\\u003c')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Git Graph</title>
<style>
  :root { --bg: #1e1e1e; --fg: #cccccc; --dim: #8b8b8b; --hover: #2a2d2e; --select: #04395e; --line: #333; --panel: #252526; }
  @media (prefers-color-scheme: light) {
    :root { --bg: #ffffff; --fg: #333333; --dim: #767676; --hover: #f0f0f0; --select: #cce4f7; --line: #e5e5e5; --panel: #f6f6f6; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  header { position: sticky; top: 0; z-index: 2; padding: 10px 16px; background: var(--bg); border-bottom: 1px solid var(--line); display: flex; gap: 12px; align-items: baseline; }
  header h1 { margin: 0; font-size: 15px; }
  header span { color: var(--dim); }
  main { display: flex; }
  .list { position: relative; flex: 1; min-width: 0; padding-bottom: 24px; }
  .graph { position: absolute; top: 0; left: 0; pointer-events: none; }
  .graph path { fill: none; stroke-width: 2; }
  .graph .dirty { fill: var(--bg); stroke-width: 2; }
  .row { height: ${ROW}px; display: flex; align-items: center; gap: 8px; padding-left: ${graph.width + 4}px; padding-right: 16px; white-space: nowrap; cursor: pointer; }
  .row:hover { background: var(--hover); }
  .row.selected { background: var(--select); }
  .dirty-row { cursor: default; font-style: italic; color: var(--dim); }
  .subject { overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
  .meta { color: var(--dim); }
  .hash { color: var(--dim); font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
  .chip { display: inline-flex; align-items: center; height: 20px; border-radius: 4px; overflow: hidden; border: 1px solid var(--c); font-size: 12px; padding-right: 6px; flex: none; }
  .chip .icon { background: var(--c); color: #fff; height: 100%; display: inline-flex; align-items: center; padding: 0 5px; margin-right: 5px; }
  .chip.head { font-weight: 600; box-shadow: 0 0 0 1px var(--c); }
  .chip.remote { opacity: 0.75; }
  aside { width: 380px; flex: none; border-left: 1px solid var(--line); background: var(--panel); padding: 16px; position: sticky; top: 45px; height: calc(100vh - 45px); overflow: auto; }
  aside[hidden] { display: none; }
  aside h2 { margin: 0 0 12px; font-size: 14px; }
  aside dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0 0 12px; }
  aside dt { color: var(--dim); }
  aside dd { margin: 0; word-break: break-all; }
  aside pre { white-space: pre-wrap; font: 12px/1.5 ui-monospace, Menlo, monospace; margin: 0; }
  @media (max-width: 720px) { aside { position: fixed; inset: auto 0 0 0; width: auto; height: 45vh; top: auto; border-left: 0; border-top: 1px solid var(--line); } }
</style>
</head>
<body>
<header><h1>${escape(title)}</h1><span>${rows.filter(row => row.commit).length} commits</span></header>
<main>
  <div class="list">${graph.markup}${items.join('')}</div>
  <aside hidden></aside>
</main>
<script>
  const commits = ${data};
  const aside = document.querySelector('aside');
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
  document.querySelector('.list').addEventListener('click', event => {
    const row = event.target.closest('.row[data-hash]');
    if (!row) return;
    const wasSelected = row.classList.contains('selected');
    document.querySelectorAll('.row.selected').forEach(el => el.classList.remove('selected'));
    if (wasSelected) { aside.hidden = true; return; }
    row.classList.add('selected');
    const c = commits[row.dataset.hash];
    aside.innerHTML = '<h2>' + esc(c.subject) + '</h2><dl>'
      + '<dt>Commit</dt><dd>' + esc(c.full ?? c.hash) + '</dd>'
      + '<dt>Parents</dt><dd>' + esc(c.parents.join(', ') || '—') + '</dd>'
      + '<dt>Author</dt><dd>' + esc(c.author) + (c.email ? ' &lt;' + esc(c.email) + '&gt;' : '') + '</dd>'
      + '<dt>Date</dt><dd>' + esc(c.when ?? c.date) + '</dd>'
      + (c.refs ? '<dt>Refs</dt><dd>' + esc(c.refs) + '</dd>' : '')
      + '</dl>' + (c.body ? '<pre>' + esc(c.body) + '</pre>' : '');
    aside.hidden = false;
  });
</script>
</body>
</html>
`
}
