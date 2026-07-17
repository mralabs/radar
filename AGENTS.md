# radar — agent guide

Agent skill that tracks the tools a repo cares about (competitors, upstream
projects, dependencies) and hands changelogs to a coding agent for analysis.
Published via the [Agent Skills spec](https://agentskills.io); installed with
`gh skill install mralabs/radar radar`.

## Layout

```
skills/radar/          the installable skill (only this dir reaches users)
├── SKILL.md           agent behavior: init/check/analyze/mark-analyzed cycle
├── scripts/
│   ├── radar.ts       thin CLI — command dispatch, printing, .radar/ paths
│   ├── comparison.ts  feature-comparison report generator
│   └── core/          self-contained domain logic (no imports outside core/)
│       └── api/       one adapter per source: github, npm, pypi, nuget
└── templates/         registry seed + weekly GitHub Actions workflow
tests/                 unit tests — outside the skill so installs stay lean
evals/                 agent-behavior evals — the SKILL.md layer tests can't reach
```

Data always lives in the CONSUMING repo under `.radar/` (cwd-relative,
git-tracked JSON). This repo's root files (README, AGENTS.md, CI) are for
development only — they are not part of the installed skill.

## Commands

```bash
bun test tests                       # all tests — network-free, must pass
bun run typecheck                    # strict tsc --noEmit, must pass
bun skills/radar/scripts/radar.ts help
```

CI enforces both on every push/PR.

Evals score SKILL.md's agent behavior — the half of radar no unit test can
reach. They call real models, so they are **not** in CI: run them before a
release or when SKILL.md changes.

```bash
# from the repo root, so the plugin auto-detects and the ablation arm resolves
CLAUDE_CODE_WALNUT_SPIRE=1 claude plugin eval . \
  --scaffold --allow-tools Bash Write Edit WebFetch WebSearch
```

`--scaffold` runs each case's `scaffold.sh` as you (we authored them; it only
writes a fake repo into the sandbox cwd). `--threshold 0.8` gates on score.
Roughly $0.20–0.50 per case per run, ×3 runs by default — cases are stochastic,
so a single run proves little. `--ablation with-without` adds a no-plugin arm,
but its Δ means little here: the baseline has no `.radar/` and cannot attempt
the task at all. The signal is the plugin arm's own score.

Two ways an eval lies green. Both have already happened here:

- **Grading the mechanism instead of the outcome.** The first draft of
  `curated-registry` watched for a `radar.ts add` call and passed while the
  agent wrote the very same unapproved entries into `registry.json` with an
  ad-hoc `bun -e` script. Assert on the resulting file.
- **Denying the tool the violation needs.** A case asserting the agent did NOT
  file/add/write proves nothing if it could not have. Grant the tools the
  violation would use — hence the `--allow-tools` list above. Watch the run
  output for `denied tools (pass --allow-tools to grant)`: any case that prints
  it scored on a fiction.

## Invariants — do not regress these

- **Never silently incomplete.** Corrupt/misshapen JSON fails loud instead of
  returning defaults (a default + save wipes user data). Incomplete ranges
  (unfound changelog anchor, fetch caps) must surface a `warning`, never look
  exhaustive. Failed fetches must not overwrite last-known version state.
- **Tokens are env-only** (`GITHUB_TOKEN`/`GH_TOKEN`). Never read secrets from
  files: `.radar/config.json` is git-tracked by design.
- **Zero runtime dependencies.** Built-in `fetch` and `node:` modules only;
  dev-deps are for typecheck/tests. The CLI must run with bare `bun`.
- **Tests stay deterministic.** Stub `globalThis.fetch`; no live network, no
  `Date.now()` assertions. Inject fakes via the `fetcher` parameter pattern
  (see `checkUpdates`).
- **CI never fetches remote code.** The consumer workflow runs the CLI copy
  vendored by `init --workflow`; actions stay pinned to commit SHAs.
- **Registry stays curated.** Agent flows may propose tools or tasks but never
  add them without user approval (see SKILL.md).

## Conventions

- Conventional commits (`feat:`, `fix:`, `chore:` …), English.
- Release = `gh skill publish --tag vX.Y.Z` AND bumping `version` in
  `.claude-plugin/plugin.json` here + radar's catalog entry in
  mralabs/claude-plugins (the org marketplace; plugin channel only sees
  updates when that field changes). This repo has no marketplace.json —
  one org, one catalog.
- Deterministic work belongs in scripts; judgment belongs in SKILL.md prose.
- New source type touches four places: an adapter in `core/api/` (+ its
  export in `core/api/index.ts`), `TOOL_TYPES` in types.ts, the
  `fetchVersion` switch in reports.ts, and — if changelogs should work for
  it — `resolveChangelogRepo` in reports.ts. Add stubbed adapter tests.
  Re-export from `core/index.ts` only if the client should be public
  barrel API (not needed for CLI behavior).
