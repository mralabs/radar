# radar — agent guide

Agent skill that tracks the tools a repo cares about (competitors, upstream
projects, dependencies) and hands changelogs to a coding agent for analysis.
Published via the [Agent Skills spec](https://agentskills.io); installed with
`gh skill install mralabs/radar radar`.

## Layout

```
action.yml             composite action consumers run SHA-pinned in weekly CI
skills/radar/          the installable skill (the only dir a skill install ships)
├── SKILL.md           agent behavior: init/check/analyze/mark-analyzed cycle
├── scripts/
│   ├── radar.js       entry point — plain .js so it starts on ANY node and
│   │                  can explain a too-old runtime instead of crashing
│   ├── radar.ts       thin CLI — command dispatch, printing, .radar/ paths
│   ├── auth.ts        GitHub token resolution (env → gh CLI); outside core/
│   └── core/          self-contained domain logic (no imports outside core/)
│       └── api/       one adapter per source: github, npm, pypi, nuget
└── templates/         registry seed + weekly GitHub Actions workflow
tests/                 unit tests — outside the skill so installs stay lean
evals/                 agent-behavior evals — the SKILL.md layer tests can't reach
```

Data always lives in the CONSUMING repo under `.radar/` (cwd-relative,
git-tracked JSON). This repo's root files (README, AGENTS.md, CI, tests,
evals) are for development only — but note the two channels differ:
`gh skill install` ships only `skills/radar/`, while the **plugin channel
clones the whole repo** into the user's plugin cache. Anything committed
anywhere in this repo reaches plugin users; never commit fixtures or
artifacts you wouldn't ship.

## Commands

```bash
npm test                             # all tests — network-free, must pass
npm run typecheck                    # strict tsc --noEmit, must pass
node skills/radar/scripts/radar.js help
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
so a single run proves little. When iterating on one case, scope with
`--case <name>` (and `--runs 1`) instead of paying for the full suite.
`--ablation with-without` adds a no-plugin arm, but its Δ means little here:
two of the scaffolds hand the baseline a populated `.radar/`, and where they
don't (curated-registry) the baseline can't attempt the task at all — either
way Δ doesn't measure "is radar good". The signal is the plugin arm's own
score.

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
- **A failed command exits non-zero.** Anything that could not do what was
  asked — missing argument, unknown tool id, a failed operation — goes through
  `fail()`, which sets `process.exitCode` (never `process.exit`, which can
  truncate the very message being printed). Two deliberate exceptions: partial
  fetch errors during `check`, because one 404 must not break the weekly
  action, and `--json`, because a valid payload describing the problem IS the
  requested output — `action.yml` reads `.errors` out of exactly such a
  payload. This is worth stating because the bug class is invisible to a human:
  the error prints either way, and only a caller reading `$?` can tell. Thirteen
  paths shipped wrong for a long time before the CI step in `check` caught it.
- **Never read a token from a file.** `.radar/config.json` is git-tracked by
  design, so a secret must not be configurable there. The resolution order is
  `GITHUB_TOKEN` → `GH_TOKEN` → `gh auth token --hostname github.com`, and an
  empty var counts as unset. The gh step is a best-effort shortcut, not a
  dependency: missing gh, logged-out gh, a GHES-only login, or a hung call (3s
  timeout) all fall through to anonymous 60 req/h — no command may require it
  to succeed. It lives in `auth.ts`, never in `core/`: core stays
  subprocess-free and deterministic. `auth.ts` takes its gh runner as a
  defaulted parameter so `tests/auth.test.ts` can fake every branch without
  spawning anything.
- **`radar.js` stays dumb on purpose.** It is the entry point, and its only job
  on an unsupported runtime is to explain the floor instead of dying inside the
  module loader. So it carries NO module syntax (no `import`/`export`, no
  top-level await) and no modern operators: it has to start on node versions
  that cannot run anything else here, and `gh skill install` ships
  `skills/radar/` with no package.json, so nothing declares whether it is ESM
  or CommonJS. Modernising it would leave every other CI job green while
  silently breaking the one path it exists for — the `too-old-node` job is what
  catches that. Real CLI logic belongs in radar.ts.
- **Zero runtime dependencies.** Built-in `fetch` and `node:` modules only;
  dev-deps are for typecheck/tests. The CLI must run with bare `node` ≥ 22.18
  AND bare `bun`: relative imports carry explicit `.ts` extensions and
  tsconfig's `erasableSyntaxOnly` blocks syntax node can't strip (enums,
  namespaces) — don't undo either.
- **The toolchain is node, nothing else.** Tests are `node:test` +
  `node:assert/strict`, npm is the package manager, and there is no test
  framework to install. Do not add an assertion library or reintroduce a
  hand-rolled `expect` helper — a homemade assertion layer is the one piece
  of test infrastructure whose bugs turn into false passes. CI runs the suite
  on three arms — the 22.18.0 floor, Active LTS, and Current — so the floor is
  tested rather than written down, and the Current arm warns early about type
  stripping, the mechanism the floor exists for. The floor is the oldest node
  that CAN run the sources, not the newest that is fashionable: don't raise it
  without a feature that actually requires it. A separate job smoke-runs the
  CLI under bun, because SKILL.md still offers bun as a runtime and that claim
  should be verified rather than assumed.
- **Shipping `.ts` and running it unbuilt is a priced decision, not a default.**
  It is why the node floor exists at all, and it is unusual: across the
  highest-star skill repos (superpowers, anthropics/skills, addyosmani,
  trailofbits, claude-plugins-official) the scripts agents invoke are Python or
  plain `.js`, and every `.ts` found in them turned out to be an example, a test
  sample, or a separately-run MCP server — none is executed as a skill script.
  The two TypeScript ones compile: dev-browser ships `bin/*.js` via npm, and
  claude-hud — same git-clone distribution as radar, so no install step runs —
  **commits `dist/`** and drops its floor to node >= 18. That is the alternative
  on offer, and its price is a build artifact that can silently go stale, which
  is the one thing "never silently incomplete" exists to prevent. radar pays a
  runtime floor instead. Don't re-open this without a new reason; both prices
  were compared on 2026-08-18.
  Nor is bun the escape from it: measured the same day, bun starts the CLI in
  52ms against node's 97ms, but radar's work is network-bound, so a real
  `check` came out 2% apart (1592ms vs 1623ms). bun is supported because it
  rescues an old-node machine, not because it is faster here.
- **Tests stay deterministic.** Stub `globalThis.fetch`; no live network, no
  `Date.now()` assertions. Inject fakes via the `fetcher` parameter pattern
  (see `checkUpdates`).
- **CI executes only SHA-pinned code.** The consumer workflow runs the
  radar composite action (`action.yml`) at a commit SHA resolved by
  `init --workflow`; actions stay pinned to commit SHAs. No floating refs
  (`@main`, tags) — ever. (Pre-0.5 vendored the CLI into `.github/radar/`
  instead; that dir is legacy and init tells users it's safe to delete.)
- **Registry stays curated.** Agent flows may propose tools or tasks but never
  add them without user approval (see SKILL.md).

## Conventions

- Conventional commits (`feat:`, `fix:`, `chore:` …), English.
- Release = `gh skill publish --tag vX.Y.Z` AND bumping `version` in
  `.claude-plugin/plugin.json` here + radar's catalog entry in
  mralabs/claude-plugins (the org marketplace; plugin channel only sees
  updates when that field changes). This repo has no marketplace.json —
  one org, one catalog.
  Let `gh skill publish` create the tag — it refuses a tag that already
  exists, so a hand-pushed `git tag` locks you out of the skill channel
  and you have to `gh release create` on top of the bare tag instead
  (`--dry-run` still validates). Three channels read three different
  things: the plugin channel reads the two `version` fields, `init
  --workflow` pins the newest semver **tag**'s SHA, and `gh skill
  install` resolves the newest **release** — a tag without a release
  leaves the skill channel on the old version.
- Deterministic work belongs in scripts; judgment belongs in SKILL.md prose.
- New source type touches four places: an adapter in `core/api/` (+ its
  export in `core/api/index.ts`), `TOOL_TYPES` in types.ts, the
  `fetchVersion` switch in reports.ts, and — if changelogs should work for
  it — `resolveChangelogRepo` in reports.ts. Add stubbed adapter tests.
  The `web` type (closed-source products: fetch page, regex the version)
  is the exception that skips `resolveChangelogRepo` — it has no repo, so
  `getChangelog` returns the URL + range and the agent WebFetches it.
  Radar does not scrape release notes; stripped-markup prose would look
  exhaustive while silently dropping half the page.
  A custom `pattern` is matched against the stripped text first and the raw
  page only if that finds nothing — the order is the whole design. Raw-only
  looked right (the pattern says where the version is) but regresses
  silently: `<meta content="Conductor 1.4.0">` outranks the body's 1.4.7,
  so the weekly check reports a version older than the page shows. Stripped
  first can only return what it always returned; the fallback exists for
  pages that keep the version nowhere else, like Mintlify's `<Update
  label="v0.22.0">`. The default heuristic never falls back — the strip is
  the only thing keeping "first version-shaped string" off asset URLs.
  A `pattern` written as a sibling of `source` is refused rather than
  dropped, but only when it is actually the one being dropped: beside a
  `source.pattern` that IS in effect it changes nothing, and failing there
  would break a working entry every week.
  Re-export from `core/index.ts` only if the client should be public
  barrel API (not needed for CLI behavior).
