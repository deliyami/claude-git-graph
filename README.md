# claude-git-graph

A Claude Code mod that shows the git commit graph of the current repository in a pane, inspired by the VS Code Git Graph extension.

## Install

```
/plugin install git-graph --marketplace deliyami/claude-git-graph
```

Then run `/git-graph` inside any git repository.

## Status

`/git-graph` opens a pane with the commit graph of all branches: each branch keeps its own colored lane, with branch and tag chips and uncommitted changes on top. Press a commit to expand its details and changed files; Esc closes the pane.

Press `o` (Open in browser) for the same graph drawn as SVG with smooth curves; click a commit there for its details. Inside [Orca](https://www.onorca.dev) it opens in Orca's built-in browser tab, elsewhere in the default browser. The page is one file per repository under `$TMPDIR/git-graph/`, overwritten each time.

## Roadmap

- [x] Commit graph pane
- [x] Select a commit and show its details / changed files
- [x] SVG graph in the browser (Orca tab inside Orca)
- [ ] Diff view
- [ ] Checkout, merge, rebase, cherry-pick with confirmation

## Develop

```sh
claude --plugin-dir ~/Desktop/dev/claude-git-graph
claude plugin validate ~/Desktop/dev/claude-git-graph
claude plugin test ~/Desktop/dev/claude-git-graph
```

## License

[MIT](LICENSE)
