/**
 * GitHub token resolution.
 *
 * Deliberately a sibling of radar.ts rather than part of core/: shelling out is
 * an environment concern, and core/ stays subprocess-free and deterministic.
 */

import { spawnSync } from 'node:child_process'

/** How long to wait on `gh auth token` before giving up and staying anonymous */
export const GH_AUTH_TIMEOUT_MS = 3000

/**
 * The slice of the environment token resolution reads. The index signature is
 * what makes `process.env` assignable — without it TS's weak-type check rejects
 * an all-optional target.
 */
export interface TokenEnv {
  GITHUB_TOKEN?: string | undefined
  GH_TOKEN?: string | undefined
  [key: string]: string | undefined
}

/** The slice of a spawnSync result token resolution reads */
export interface GhResult {
  status: number | null
  stdout: string
  error?: Error | undefined
}

/** Injectable seam — tests pass a fake instead of spawning a real gh */
export type GhRunner = () => GhResult

/**
 * Run `gh auth token` for github.com.
 *
 * `--hostname` is load-bearing: without it gh returns the DEFAULT host's token,
 * so someone logged in only to a GHES instance would send a GHES token to
 * api.github.com and get 401 — worse than staying anonymous. It costs no
 * compatibility, because `gh auth token` and its `--hostname` flag shipped
 * together in gh v2.17.0; no released gh has the command without the flag.
 */
export const runGh: GhRunner = () => {
  const result = spawnSync('gh', ['auth', 'token', '--hostname', 'github.com'], {
    encoding: 'utf8',
    timeout: GH_AUTH_TIMEOUT_MS,
    // stderr is dropped: a logged-out gh is an expected outcome, not an error
    // worth printing, and nothing from this call should reach the terminal
    stdio: ['ignore', 'pipe', 'ignore']
  })
  return { status: result.status, stdout: result.stdout ?? '', error: result.error }
}

/**
 * Ask an authenticated gh CLI for the token it already holds.
 *
 * Optional by construction: gh missing, logged out, authenticated only to a
 * GHES host, or hung past the timeout all yield null and leave the run
 * anonymous at 60 req/h. gh is never a radar runtime dependency.
 */
export function ghAuthToken(run: GhRunner = runGh): string | null {
  const result = run()
  // A timeout kills the child and leaves status null, so this covers it too
  if (result.error || result.status !== 0) return null
  return result.stdout.trim() || null
}

/**
 * Resolve the GitHub token: GITHUB_TOKEN, then GH_TOKEN, then the gh CLI.
 *
 * Never from files — .radar/config.json is git-tracked by design, so a secret
 * must not be configurable there. Asking gh for its own token is neither a file
 * read nor a configured source; it reuses a login the user already performed.
 *
 * Falsy beats nullish here: `export GITHUB_TOKEN=` is common in CI shells, and
 * an empty var should fall through to the next source rather than win and
 * authenticate nothing.
 */
export function resolveGitHubToken(
  env: TokenEnv = process.env,
  run: GhRunner = runGh
): string | null {
  return env.GITHUB_TOKEN || env.GH_TOKEN || ghAuthToken(run)
}
