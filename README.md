# radar

[![CI](https://github.com/mralabs/radar/actions/workflows/ci.yml/badge.svg)](https://github.com/mralabs/radar/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Agent skill that tracks competitors, upstream tools and key dependencies of
your repo — checks versions, reads changelogs, and tells you what matters
for *your* project.

Works with any agent supporting the [Agent Skills spec](https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/):
Claude Code, Codex, Cursor, Gemini CLI, Copilot, Antigravity.

## Install

**Claude Code** — as a plugin (central install, per-project enable):

```
/plugin marketplace add mralabs/claude-plugins
/plugin install radar@mralabs
```

**Any agent** — via the GitHub CLI:

```bash
gh skill install mralabs/radar radar                       # interactive — pick your agent
```

Or target an agent directly — the skill works anywhere the
[Agent Skills spec](https://agentskills.io) does (45+ hosts):

```bash
gh skill install mralabs/radar radar --agent claude-code
gh skill install mralabs/radar radar --agent codex
gh skill install mralabs/radar radar --agent opencode
gh skill install mralabs/radar radar --agent cursor
gh skill install mralabs/radar radar --agent gemini-cli
gh skill install mralabs/radar radar --agent github-copilot
# …plus Amp, Goose, Windsurf, Warp, Cline, Junie and more:
# gh skill install --help for the full list
```

Default scope is the current repo; add `--scope user` to install globally.

Requires `gh` ≥ 2.90 (the release that introduced `gh skill`). The bundled CLI runs on [bun](https://bun.sh)
or plain Node ≥ 22.18 — whichever is already installed.
No `gh`? Cloning this repo's `skills/radar/` into your agent's skills
directory works the same.

## Use

In any repo:

```
/radar init      # creates .radar/ (git-tracked), proposes what to track
/radar           # check → changelogs → analysis grounded in YOUR repo
/radar add <url> # track a new tool
/radar discover  # find new tools in your categories
/radar deep <x>  # research one tool in depth — tracked or not
```

Findings are reported, not filed. `/radar init` asks where 🔥/💡 items
should go (a task board, GitHub issues, a spec file) and remembers it —
but nothing gets created until you say so.

Deterministic work (version checks against GitHub/npm/PyPI/NuGet,
changelog fetching, state) runs in the bundled CLI (`scripts/radar.ts`,
zero deps, bun or node). The agent does the judgment: compares changes
against your roadmap and code, produces recommendations. Changelogs come
from GitHub releases, falling back to the repo's `CHANGELOG.md`, then to
commits — always flagging when a range may be incomplete.

Optional weekly check via GitHub Actions: `/radar init --workflow` — keeps
a rolling "Radar digest" issue and comments when new updates (or check
errors — a silently failing source is a finding too) land. GitHub
notifications = your alerting, no infra; run summary in the Actions tab.
The installed workflow is two `uses:` lines running the radar composite
action pinned to a commit SHA — nothing floating executes in your CI, and
Dependabot's `github-actions` ecosystem will PR pin updates if enabled.

Want the analysis automated too? The installed `.github/workflows/radar.yml`
ends with a commented-out job step running
[claude-code-action](https://github.com/anthropics/claude-code-action) that
reads the updates and comments its analysis on the digest issue. Uncomment
it, add an `ANTHROPIC_API_KEY` repo secret, and pin the action to a
reviewed commit SHA (same supply-chain policy as the rest of the workflow).

## Data layout (in the consuming repo)

```
.radar/
├── registry.json   # tracked tools: categories, features, curated notes
├── versions.json   # last-known versions + history
└── config.json     # taskSink — where 🔥/💡 findings get filed (tokens are env-only: GITHUB_TOKEN)
```

Set `GITHUB_TOKEN` env to lift the anonymous 60 req/h GitHub API limit.

## License

MIT
