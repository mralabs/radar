/**
 * GitHub API Tests — network stubbed, deterministic
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { getGitHubReleasesSince, getGitHubCommitsSince, getLatestTagSha, getGitHubFileText, extractGitHubRepo, tagMatchesVersion } from '../skills/radar/scripts/core/api/github.ts'

const realFetch = globalThis.fetch

function stubReleasePages(pages: Array<Array<{ tag_name: string }>>): string[] {
  const requested: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    requested.push(url)
    const page = Number(new URL(url).searchParams.get('page') ?? '1')
    return Response.json(pages[page - 1] ?? [])
  }) as typeof fetch
  return requested
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('extractGitHubRepo', () => {
  it('parses common repository url forms', () => {
    assert.strictEqual(extractGitHubRepo('git+https://github.com/owner/repo.git'), 'owner/repo')
    assert.strictEqual(extractGitHubRepo('https://github.com/owner/repo'), 'owner/repo')
    assert.strictEqual(extractGitHubRepo('git://github.com/owner/repo.git'), 'owner/repo')
    assert.strictEqual(extractGitHubRepo('https://github.com/owner/repo/tree/main'), 'owner/repo')
    assert.strictEqual(extractGitHubRepo('https://example.com/owner/repo'), null)
    assert.strictEqual(extractGitHubRepo(null), null)
  })
})

describe('tagMatchesVersion', () => {
  it('matches plain and v-prefixed tags', () => {
    assert.strictEqual(tagMatchesVersion('v1.2.3', '1.2.3'), true)
    assert.strictEqual(tagMatchesVersion('1.2.3', 'v1.2.3'), true)
  })

  it('matches monorepo tag styles only for the tracked package', () => {
    assert.strictEqual(tagMatchesVersion('mypkg@1.2.3', '1.2.3', 'mypkg'), true)
    assert.strictEqual(tagMatchesVersion('mypkg@v1.2.3', '1.2.3', 'mypkg'), true)
    assert.strictEqual(tagMatchesVersion('mypkg/v1.2.3', '1.2.3', 'mypkg'), true)
    assert.strictEqual(tagMatchesVersion('mypkg-v1.2.3', '1.2.3', 'mypkg'), true)
    assert.strictEqual(tagMatchesVersion('@scope/mypkg@1.2.3', '1.2.3', '@scope/mypkg'), true)
  })

  it("never matches another package's tag (silent wrong-anchor bug)", () => {
    assert.strictEqual(tagMatchesVersion('otherpkg@1.2.3', '1.2.3', 'mypkg'), false)
    // without a package name, monorepo styles do not match at all
    assert.strictEqual(tagMatchesVersion('mypkg@1.2.3', '1.2.3'), false)
  })

  it('does not false-positive on version suffixes', () => {
    assert.strictEqual(tagMatchesVersion('v11.2.3', '1.2.3'), false)
    assert.strictEqual(tagMatchesVersion('mypkg@11.2.3', '1.2.3', 'mypkg'), false)
  })
})

describe('getGitHubReleasesSince — package-scoped anchors', () => {
  it("passes another package's tag and stops at the tracked one", async () => {
    stubReleasePages([[
      { tag_name: 'mypkg@2.0.0' },
      { tag_name: 'otherpkg@1.2.3' }, // wrong-anchor candidate
      { tag_name: 'mypkg@1.5.0' },
      { tag_name: 'mypkg@1.2.3' }     // real anchor
    ]])

    const result = await getGitHubReleasesSince('o/r', '1.2.3', 5, 'mypkg')

    assert.deepStrictEqual(result.releases.map(r => r.tag_name), [
      'mypkg@2.0.0',
      'otherpkg@1.2.3',
      'mypkg@1.5.0'
    ])
    assert.strictEqual(result.anchorFound, true)
  })
})

describe('getGitHubReleasesSince', () => {
  it('collects releases until the anchor version, across pages', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ tag_name: `v9.${99 - i}.0` }))
    const page2 = [{ tag_name: 'v8.2.0' }, { tag_name: 'v8.1.0' }, { tag_name: 'v8.0.0' }]
    stubReleasePages([page1, page2])

    const result = await getGitHubReleasesSince('o/r', '8.1.0')

    // everything newer than 8.1.0: 100 from page 1 + v8.2.0
    assert.strictEqual(result.releases.length, 101)
    assert.strictEqual(result.releases.at(-1)?.tag_name, 'v8.2.0')
    assert.strictEqual(result.anchorFound, true)
    assert.strictEqual(result.truncated, false)
  })

  it('reports anchorFound=false when the anchor is not among tags', async () => {
    stubReleasePages([[{ tag_name: 'v2.0.0' }, { tag_name: 'v1.5.0' }]])

    const result = await getGitHubReleasesSince('o/r', '1.0.0')

    assert.strictEqual(result.releases.length, 2)
    assert.strictEqual(result.anchorFound, false)
  })

  it('reports truncated=true when the anchor lies beyond the page cap', async () => {
    const fullPage = (major: number) =>
      Array.from({ length: 100 }, (_, i) => ({ tag_name: `v${major}.${99 - i}.0` }))
    // anchor would be on page 6, past the default 5-page cap
    const requested = stubReleasePages([
      fullPage(9), fullPage(8), fullPage(7), fullPage(6), fullPage(5),
      [{ tag_name: 'v0.1.0' }]
    ])

    const result = await getGitHubReleasesSince('o/r', '0.1.0')

    assert.strictEqual(requested.length, 5)
    assert.strictEqual(result.releases.length, 500)
    assert.strictEqual(result.anchorFound, false)
    assert.strictEqual(result.truncated, true)
  })

  it('fetches a single page when no anchor exists (baseline case)', async () => {
    const requested = stubReleasePages([
      Array.from({ length: 100 }, (_, i) => ({ tag_name: `v${i}` })),
      [{ tag_name: 'old' }]
    ])

    const result = await getGitHubReleasesSince('o/r', null)

    assert.strictEqual(result.releases.length, 100)
    assert.strictEqual(result.anchorFound, true)
    assert.strictEqual(requested.length, 1)
  })
})

describe('getGitHubCommitsSince', () => {
  function stubCompare(handler: (url: string) => Response): void {
    globalThis.fetch = (async (input: string | URL | Request) =>
      handler(String(input))) as typeof fetch
  }

  const commit = (sha: string) => ({
    sha,
    commit: { author: { date: '2026-01-01' }, message: `msg ${sha}` }
  })

  it('collects the full range across pages, newest first', async () => {
    stubCompare(url => {
      const page = Number(new URL(url).searchParams.get('page'))
      const pages = [
        Array.from({ length: 100 }, (_, i) => commit(`a${i}`)),
        Array.from({ length: 20 }, (_, i) => commit(`b${i}`))
      ]
      return Response.json({ total_commits: 120, commits: pages[page - 1] ?? [] })
    })

    const result = await getGitHubCommitsSince('o/r', '1.2.3')

    assert.strictEqual(result.commits.length, 120)
    assert.strictEqual(result.anchorFound, true)
    assert.strictEqual(result.truncated, false)
    assert.strictEqual(result.commits[0].sha, 'b19') // reversed: newest first
  })

  it('retries with v prefix when the bare ref 404s', async () => {
    const tried: string[] = []
    stubCompare(url => {
      tried.push(decodeURIComponent(url))
      if (url.includes('v1.2.3')) {
        return Response.json({ total_commits: 1, commits: [commit('x')] })
      }
      return new Response('not found', { status: 404 })
    })

    const result = await getGitHubCommitsSince('o/r', '1.2.3')

    assert.strictEqual(result.anchorFound, true)
    assert.strictEqual(result.commits.length, 1)
    assert.strictEqual(tried.some(u => u.includes('/compare/1.2.3...HEAD')), true)
  })

  it('resolves commit-<sha> anchors', async () => {
    stubCompare(url =>
      url.includes('abc1234')
        ? Response.json({ total_commits: 2, commits: [commit('c1'), commit('c2')] })
        : new Response('not found', { status: 404 })
    )

    const result = await getGitHubCommitsSince('o/r', 'commit-abc1234')

    assert.strictEqual(result.anchorFound, true)
    assert.strictEqual(result.commits.length, 2)
  })

  it('reports truncated when the fetch limit hides older commits', async () => {
    stubCompare(url => {
      const page = Number(new URL(url).searchParams.get('page'))
      const commits = page <= 3 ? Array.from({ length: 100 }, (_, i) => commit(`p${page}-${i}`)) : []
      return Response.json({ total_commits: 400, commits })
    })

    const result = await getGitHubCommitsSince('o/r', '1.0.0')

    assert.strictEqual(result.commits.length, 300)
    assert.strictEqual(result.truncated, true)
    assert.strictEqual(result.totalCommits, 400)
  })

  it('reports anchorFound=false when no ref spelling resolves', async () => {
    stubCompare(() => new Response('not found', { status: 404 }))

    const result = await getGitHubCommitsSince('o/r', '9.9.9')

    assert.strictEqual(result.anchorFound, false)
    assert.strictEqual(result.commits.length, 0)
  })
})

describe('getLatestTagSha', () => {
  function stubTags(tags: Array<{ name: string; commit: { sha: string } }>): void {
    globalThis.fetch = (async (_input: string | URL | Request) => Response.json(tags)) as typeof fetch
  }

  it('picks the highest semver, not the API order', async () => {
    stubTags([
      { name: 'v0.9.0', commit: { sha: 'old' } },
      { name: 'v0.10.0', commit: { sha: 'newest' } },
      { name: 'v0.2.0', commit: { sha: 'ancient' } }
    ])

    const result = await getLatestTagSha('o/r')

    assert.strictEqual(result?.tag, 'v0.10.0')
    assert.strictEqual(result?.sha, 'newest')
  })

  it('ignores non-release tags', async () => {
    stubTags([
      { name: 'nightly', commit: { sha: 'x' } },
      { name: 'v1.0.0-rc.1', commit: { sha: 'y' } },
      { name: 'v1.0.0', commit: { sha: 'release' } }
    ])

    assert.strictEqual((await getLatestTagSha('o/r'))?.sha, 'release')
  })

  it('returns null when no release tags exist', async () => {
    stubTags([])
    assert.strictEqual(await getLatestTagSha('o/r'), null)
  })
})

describe('getGitHubFileText', () => {
  it('fetches at the given ref and decodes base64', async () => {
    let seen = ''
    globalThis.fetch = (async (input: string | URL | Request) => {
      seen = String(input)
      return Response.json({
        content: Buffer.from('name: radar check').toString('base64'),
        encoding: 'base64'
      })
    }) as typeof fetch

    const text = await getGitHubFileText('o/r', 'action.yml', 'abc123')

    assert.strictEqual(text, 'name: radar check')
    assert.ok(seen.includes('/repos/o/r/contents/action.yml?ref=abc123'))
  })

  it('returns null when the file does not exist at the ref', async () => {
    globalThis.fetch = (async (_input: string | URL | Request) =>
      new Response('not found', { status: 404 })) as typeof fetch

    assert.strictEqual(await getGitHubFileText('o/r', 'action.yml', 'abc123'), null)
  })
})
