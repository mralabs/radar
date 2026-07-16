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
```

Data always lives in the CONSUMING repo under `.radar/` (cwd-relative,
git-tracked JSON). This repo's root files (README, AGENTS.md, CI) are for
development only — they are not part of the installed skill.

## Commands

```bash
bun test skills/radar/scripts/core   # all tests — network-free, must pass
bun run typecheck                    # strict tsc --noEmit, must pass
bun skills/radar/scripts/radar.ts help
```

CI enforces both on every push/PR.

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
- Deterministic work belongs in scripts; judgment belongs in SKILL.md prose.
- New source type touches four places: an adapter in `core/api/` (+ its
  export in `core/api/index.ts`), `TOOL_TYPES` in types.ts, the
  `fetchVersion` switch in reports.ts, and — if changelogs should work for
  it — `resolveChangelogRepo` in reports.ts. Add stubbed adapter tests.
  Re-export from `core/index.ts` only if the client should be public
  barrel API (not needed for CLI behavior).
