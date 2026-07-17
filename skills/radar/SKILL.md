---
name: radar
license: MIT
description: Track competitors, upstream tools and key dependencies of this repo — check versions, read changelogs, and produce recommendations grounded in THIS project's roadmap and code. Use for "/radar", "what's new in the ecosystem", "check competitors", or "did X release something".
---

# radar

Ecosystem tracking for the current repo. Deterministic work (version checks,
changelog fetching, state) is done by the bundled CLI; your job is the
**analysis layer**: read what changed, compare it against THIS project, and
say what matters.

All data lives in the consuming repo under `.radar/` (git-tracked JSON).
Run every command from the repo root.

```bash
bun <skill-dir>/scripts/radar.ts <command>   # requires bun
```

## First use in a repo: `/radar init`

1. Run `radar.ts init` (add `--workflow` if the user wants the weekly
   GitHub Actions check — it maintains a rolling "Radar digest" issue
   and comments when new updates land).
2. Read the project's context (README, CLAUDE.md/AGENTS.md, package
   manifest, roadmap docs) and **propose seed entries** per category:
   - `official` — tools the project builds on (for an agent-adjacent
     project, `anthropics/claude-code` is almost always first)
   - `competitors` — same-space products
   - `deps` — libraries whose breaking changes hurt
   - `inspiration` — idea sources

   Then **stop and end your turn with that proposal.** Init is a two-turn
   flow: propose, wait, add. A tool the user has not named does not enter
   the registry — not via `radar.ts add`, not via a hand-edit, not via a
   script. Listing what you already added is not proposing.
3. Once the user approves, add the entries via
   `radar.ts add <type> <source> --category X` (types: github, npm, pypi).
   Then enrich each entry's `features` and `notes` fields in
   `.radar/registry.json` — these drive analysis quality.
4. Set `selfId` in `.radar/config.json` to the project's own id.

## Main flow: `/radar` (no args)

1. `radar.ts check` — fetches latest versions, diffs against known state.
   A tool's FIRST check records a baseline (`NEW — tracking from X`):
   tracking starts at the version first seen, past releases are not
   analyzed. Updates fire from the next release onward.
2. For each tool WITH an update: `radar.ts changelog <id>`.
3. Analyze. For every meaningful change, ground it in this project:
   - Read the relevant part of THIS repo (roadmap, the subsystem the
     change touches) before claiming impact.
   - Classify: 🔥 affects us directly / 💡 feature worth adopting /
     ✅ irrelevant (say so in one line, don't pad).
   - For 💡 items: state what the competitor did, how it maps to this
     project's architecture, and a concrete next step.
4. If the project has a task board (MCP tools, issue tracker), offer to
   create tasks for 🔥/💡 items — never create them unasked.
5. `radar.ts mark-analyzed <id>` for each tool you covered, so the next
   run only surfaces new material.

Report format: lead with the one-line verdict per tool, details after.
No boilerplate — a tool with nothing relevant gets one ✅ line.

## Other commands

| Ask | Do |
|-----|----|
| `/radar help` | Explain how radar works in your own words: the init → check (NEW baseline) → changelog → analyze → mark-analyzed cycle, the optional weekly CI issue flow, and what `.radar/` holds. Use examples from THIS repo's registry. `radar.ts help` prints the CLI reference |
| `/radar add <url or name>` | Infer type/source, `radar.ts add`, then fetch the README and fill `features`/`notes` in the registry |
| `/radar discover` | Web-search for new tools in the registry's categories; propose candidates with stars + one-liner; add only what the user approves |
| `/radar deep <id>` | Read the tool's README, docs, recent releases; update its `features`/`notes`; report how it compares to this project |
| `/radar list` / `show <id>` / `history <id>` | Run the CLI command, relay output |
| `/radar suggest` | `radar.ts suggest` (needs comparison data + `selfId`) |

## Notes

- GitHub API is rate-limited (60/h anonymous). If checks error, set
  `GITHUB_TOKEN` env — `radar.ts rate-limit` shows current quota.
- Registry `notes`/`features` are curated knowledge, not cache — improve
  them whenever a deep-dive teaches you something.
- Never auto-add tools or auto-create tasks; the registry stays curated
  by the user.
