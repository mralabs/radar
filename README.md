# radar

Agent skill that tracks competitors, upstream tools and key dependencies of
your repo — checks versions, reads changelogs, and tells you what matters
for *your* project.

Works with any agent supporting the [Agent Skills spec](https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/):
Claude Code, Codex, Cursor, Gemini CLI, Copilot, Antigravity.

## Install

**Claude Code** — as a plugin (central install, per-project enable):

```
/plugin marketplace add mralabs/radar
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

Requires `gh` ≥ 2.8x (2026) and [bun](https://bun.sh) for the bundled CLI.
No `gh`? Cloning this repo's `skills/radar/` into your agent's skills
directory works the same.

## Use

In any repo:

```
/radar init      # creates .radar/ (git-tracked), proposes what to track
/radar           # check → changelogs → analysis grounded in YOUR repo
/radar add <url> # track a new tool
/radar discover  # find new tools in your categories
```

Deterministic work (version checks against GitHub/npm/PyPI, changelog
fetching, state) runs in the bundled CLI (`scripts/radar.ts`, zero deps,
bun). The agent does the judgment: compares changes against your roadmap
and code, produces recommendations.

Optional weekly check via GitHub Actions: `/radar init --workflow` — keeps
a rolling "Radar digest" issue and comments when new updates land (GitHub
notifications = your alerting, no infra; run summary in the Actions tab).

## Data layout (in the consuming repo)

```
.radar/
├── registry.json   # tracked tools: categories, features, curated notes
├── versions.json   # last-known versions + history
└── config.json     # selfId (tokens are env-only: GITHUB_TOKEN)
```

Set `GITHUB_TOKEN` env to lift the anonymous 60 req/h GitHub API limit.
