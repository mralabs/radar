/**
 * Token resolution tests — gh is faked, never spawned, so these stay
 * deterministic on machines with and without gh installed.
 */

import { describe, it, expect } from 'bun:test'
import { resolveGitHubToken, ghAuthToken, type GhResult, type GhRunner } from '../skills/radar/scripts/auth.ts'

/** A gh runner that records whether it was called at all */
function fakeGh(result: GhResult): GhRunner & { calls: number } {
  const run = (() => {
    run.calls++
    return result
  }) as GhRunner & { calls: number }
  run.calls = 0
  return run
}

const OK = (stdout: string): GhResult => ({ status: 0, stdout })

describe('resolveGitHubToken', () => {
  it('prefers GITHUB_TOKEN and never asks gh', () => {
    const gh = fakeGh(OK('gh-token'))
    expect(resolveGitHubToken({ GITHUB_TOKEN: 'env-token', GH_TOKEN: 'other' }, gh)).toBe('env-token')
    expect(gh.calls).toBe(0)
  })

  it('falls back to GH_TOKEN and still never asks gh', () => {
    const gh = fakeGh(OK('gh-token'))
    expect(resolveGitHubToken({ GH_TOKEN: 'gh-env-token' }, gh)).toBe('gh-env-token')
    expect(gh.calls).toBe(0)
  })

  it('asks gh only when neither var is set', () => {
    const gh = fakeGh(OK('gh-token'))
    expect(resolveGitHubToken({}, gh)).toBe('gh-token')
    expect(gh.calls).toBe(1)
  })

  it('treats an empty env var as unset instead of authenticating with nothing', () => {
    const gh = fakeGh(OK('gh-token'))
    expect(resolveGitHubToken({ GITHUB_TOKEN: '', GH_TOKEN: '' }, gh)).toBe('gh-token')
  })

  it('stays anonymous when nothing supplies a token', () => {
    expect(resolveGitHubToken({}, fakeGh({ status: 1, stdout: '' }))).toBeNull()
  })
})

describe('ghAuthToken', () => {
  it('returns the trimmed token on success', () => {
    expect(ghAuthToken(fakeGh(OK('gho_abc123\n')))).toBe('gho_abc123')
  })

  it('returns null when gh is logged out (non-zero exit)', () => {
    expect(ghAuthToken(fakeGh({ status: 1, stdout: '' }))).toBeNull()
  })

  it('returns null when gh is missing (spawn error)', () => {
    const err = Object.assign(new Error('spawnSync gh ENOENT'), { code: 'ENOENT' })
    expect(ghAuthToken(fakeGh({ status: null, stdout: '', error: err }))).toBeNull()
  })

  it('returns null when the call times out (killed, status null)', () => {
    expect(ghAuthToken(fakeGh({ status: null, stdout: '' }))).toBeNull()
  })

  it('returns null when gh exits 0 but prints nothing usable', () => {
    expect(ghAuthToken(fakeGh(OK('  \n')))).toBeNull()
  })

  it('never returns a token from a successful-looking failure', () => {
    // status 0 is the ONLY success signal — stdout alone must not be trusted
    expect(ghAuthToken(fakeGh({ status: 2, stdout: 'gho_leaked' }))).toBeNull()
  })
})
