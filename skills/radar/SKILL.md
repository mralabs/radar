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
bun <skill-dir>/scripts/radar.ts <command>   # or `node` (≥ 22.18) if bun isn't installed
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

   In the same turn, ask where 🔥/💡 findings should land later — and
   keep the plumbing invisible: the user never hears "taskSink", "config"
   or "init". Look around FIRST (a task-board MCP tool, an issue tracker,
   a docs/specs dir, a TODO.md) and offer what you actually found as
   concrete choices in the user's own terms — "open tasks on your rigo
   board", "write a spec under docs/specs/" — plus the two always-valid
   defaults: "append to a markdown file in the repo" and "just report,
   file nothing". Never ask cold with abstract vocabulary.

   Then **stop and end your turn with that proposal.** Init is a two-turn
   flow: propose, wait, write. Ask everything you need in the first turn,
   so the user answers once. A tool the user has not named does not enter
   the registry — not via `radar.ts add`, not via a hand-edit, not via a
   script. Listing what you already added is not proposing.
3. Once the user answers, add the approved entries via
   `radar.ts add <type> <source> --category X` (types: github, npm, pypi,
   nuget). Then enrich each entry's `features` and `notes` fields in
   `.radar/registry.json` — these drive analysis quality.
4. Write `.radar/config.json`: `taskSink` = free text naming the sink the
   user picked (`"rigo board"`, `"GitHub issues"`, `"a spec file under
   docs/specs/"`). If they want findings reported and nothing more, write
   `null` — that is an answer, and recording it stops the main flow from
   asking again.

## Main flow: `/radar` (no args)

1. `radar.ts check` — fetches latest versions, diffs against known state.
   No `.radar/` yet? The CLI says so and exits — don't improvise: run the
   `/radar init` flow above (propose, wait, write), then resume here.
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
     project's architecture, and a concrete next step. Exploring to get
     there is fine — download a package to read its source, prototype to
     verify a claim — but do it in a temp dir OUTSIDE the repo, never in
     the working tree. Needs this repo's own code? Use a temp git
     worktree (`git worktree add /tmp/radar-exp && …` , remove after) —
     full repo, zero footprint in the user's checkout. Cleanup-later on
     the working tree is not a plan (interrupted turns leave junk, and
     undo can eat the user's uncommitted changes); the repo only ever
     receives the report, and implementation starts when the user asks.
4. Read `taskSink` from `.radar/config.json` and offer to file the 🔥/💡
   items there — it names the sink in the user's own words, so honor it
   (`"rigo board"` → the board's MCP tools, `"GitHub issues"` → `gh`).
   `null` means the user already said report-only: skip this step. Field
   absent means the question was never answered (an init that didn't
   finish, or a config from before `taskSink`) — don't guess a sink, and
   don't surface the plumbing: no "taskSink", no config paths, no "init
   didn't finish". Do what init does: look around the repo, then ask in
   plain words with the concrete options you found ("open tasks on your
   board", "append to a markdown file", "just report — I won't ask
   again"). Record the answer silently so this is the last time.

   Offer, never act: no task, issue or file gets created until the user
   says yes. A `taskSink` records WHERE findings go if the user wants
   them filed, not standing permission to file them.
5. `radar.ts mark-analyzed <id>` for each tool you covered, so the next
   run only surfaces new material.

Report format: lead with the one-line verdict per tool, details after.
No boilerplate — a tool with nothing relevant gets one ✅ line.

## Other commands

| Ask | Do |
|-----|----|
| `/radar help` | Explain how radar works in your own words: the init → check (NEW baseline) → changelog → analyze → mark-analyzed cycle, the optional weekly CI issue flow, and what `.radar/` holds. Use examples from THIS repo's registry. `radar.ts help` prints the CLI reference |
| `/radar add <url or name>` | Infer type/source, `radar.ts add`, then fetch the README and fill `features`/`notes` in the registry |
| `/radar discover` | Web-search for new tools in the registry's categories; propose candidates with stars + one-liner; add only what the user approves. `discover` scans a category broadly; `deep` drills into one named tool |
| `/radar deep <id or name/url>` | Read the tool's README, docs, recent releases; report how it compares to this project. **Tracked** (id matches the registry): also update its `features`/`notes` and refresh `stars` (they're recorded at add time and go stale otherwise). **Untracked** (a name or URL): the research is identical — it runs off the web, not the registry — so do it anyway, then close with a reasoned add/skip recommendation and a category. Add only via `radar.ts add`, only if the user says yes |
| `/radar list` / `show <id>` / `history <id>` | Run the CLI command, relay output |

## Notes

- `.github/workflows/radar.yml` exists only because `init --workflow` was
  run — it belongs to the optional weekly CI check, not to the skill
  install channel; deleting it removes the check cleanly, local `/radar`
  use is unaffected. It runs the `mralabs/radar` composite action pinned
  to a commit SHA. A `.github/radar/` dir is the pre-0.5 vendored CLI —
  but check radar.yml first: the pre-0.5 workflow RUNS that dir. If
  radar.yml references `.github/radar/`, delete both together and re-run
  `init --workflow`; only then is the dir safe to remove.
- GitHub API is rate-limited (60/h anonymous). If checks error, set
  `GITHUB_TOKEN` env — `radar.ts rate-limit` shows current quota.
- Registry `notes`/`features` are curated knowledge, not cache — improve
  them whenever a deep-dive teaches you something.
- Never auto-add tools or auto-create tasks; the registry stays curated
  by the user.
