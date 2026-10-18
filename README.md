# claude-git-graph

A Claude Code mod that shows the git commit graph of the current repository in a pane, inspired by the VS Code Git Graph extension.

## Install

```
/plugin install git-graph --marketplace deliyami/claude-git-graph
```

Then run `/git-graph` inside any git repository.

## Status

Early skeleton: `/git-graph` opens a pane with `git log --graph --all` output.

## Roadmap

- [x] Commit graph pane
- [ ] Select a commit and show its details / changed files
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
