/**
 * GitHub API Tests — network stubbed, deterministic
 */

import { describe, it, expect, afterEach } from 'bun:test'
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
    expect(extractGitHubRepo('git+https://github.com/owner/repo.git')).toBe('owner/repo')
    expect(extractGitHubRepo('https://github.com/owner/repo')).toBe('owner/repo')
    expect(extractGitHubRepo('git://github.com/owner/repo.git')).toBe('owner/repo')
    expect(extractGitHubRepo('https://github.com/owner/repo/tree/main')).toBe('owner/repo')
    expect(extractGitHubRepo('https://example.com/owner/repo')).toBeNull()
    expect(extractGitHubRepo(null)).toBeNull()
  })
})

describe('tagMatchesVersion', () => {
  it('matches plain and v-prefixed tags', () => {
    expect(tagMatchesVersion('v1.2.3', '1.2.3')).toBe(true)
    expect(tagMatchesVersion('1.2.3', 'v1.2.3')).toBe(true)
  })

  it('matches monorepo tag styles only for the tracked package', () => {
    expect(tagMatchesVersion('mypkg@1.2.3', '1.2.3', 'mypkg')).toBe(true)
    expect(tagMatchesVersion('mypkg@v1.2.3', '1.2.3', 'mypkg')).toBe(true)
    expect(tagMatchesVersion('mypkg/v1.2.3', '1.2.3', 'mypkg')).toBe(true)
    expect(tagMatchesVersion('mypkg-v1.2.3', '1.2.3', 'mypkg')).toBe(true)
    expect(tagMatchesVersion('@scope/mypkg@1.2.3', '1.2.3', '@scope/mypkg')).toBe(true)
  })

  it("never matches another package's tag (silent wrong-anchor bug)", () => {
    expect(tagMatchesVersion('otherpkg@1.2.3', '1.2.3', 'mypkg')).toBe(false)
    // without a package name, monorepo styles do not match at all
    expect(tagMatchesVersion('mypkg@1.2.3', '1.2.3')).toBe(false)
  })

  it('does not false-positive on version suffixes', () => {
    expect(tagMatchesVersion('v11.2.3', '1.2.3')).toBe(false)
    expect(tagMatchesVersion('mypkg@11.2.3', '1.2.3', 'mypkg')).toBe(false)
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

    expect(result.releases.map(r => r.tag_name)).toEqual([
      'mypkg@2.0.0',
      'otherpkg@1.2.3',
      'mypkg@1.5.0'
    ])
    expect(result.anchorFound).toBe(true)
  })
})

describe('getGitHubReleasesSince', () => {
  it('collects releases until the anchor version, across pages', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ tag_name: `v9.${99 - i}.0` }))
    const page2 = [{ tag_name: 'v8.2.0' }, { tag_name: 'v8.1.0' }, { tag_name: 'v8.0.0' }]
    stubReleasePages([page1, page2])

    const result = await getGitHubReleasesSince('o/r', '8.1.0')

    // everything newer than 8.1.0: 100 from page 1 + v8.2.0
    expect(result.releases).toHaveLength(101)
    expect(result.releases.at(-1)?.tag_name).toBe('v8.2.0')
    expect(result.anchorFound).toBe(true)
    expect(result.truncated).toBe(false)
  })

  it('reports anchorFound=false when the anchor is not among tags', async () => {
    stubReleasePages([[{ tag_name: 'v2.0.0' }, { tag_name: 'v1.5.0' }]])

    const result = await getGitHubReleasesSince('o/r', '1.0.0')

    expect(result.releases).toHaveLength(2)
    expect(result.anchorFound).toBe(false)
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

    expect(requested).toHaveLength(5)
    expect(result.releases).toHaveLength(500)
    expect(result.anchorFound).toBe(false)
    expect(result.truncated).toBe(true)
  })

  it('fetches a single page when no anchor exists (baseline case)', async () => {
    const requested = stubReleasePages([
      Array.from({ length: 100 }, (_, i) => ({ tag_name: `v${i}` })),
      [{ tag_name: 'old' }]
    ])

    const result = await getGitHubReleasesSince('o/r', null)

    expect(result.releases).toHaveLength(100)
    expect(result.anchorFound).toBe(true)
    expect(requested).toHaveLength(1)
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

    expect(result.commits).toHaveLength(120)
    expect(result.anchorFound).toBe(true)
    expect(result.truncated).toBe(false)
    expect(result.commits[0].sha).toBe('b19') // reversed: newest first
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

    expect(result.anchorFound).toBe(true)
    expect(result.commits).toHaveLength(1)
    expect(tried.some(u => u.includes('/compare/1.2.3...HEAD'))).toBe(true)
  })

  it('resolves commit-<sha> anchors', async () => {
    stubCompare(url =>
      url.includes('abc1234')
        ? Response.json({ total_commits: 2, commits: [commit('c1'), commit('c2')] })
        : new Response('not found', { status: 404 })
    )

    const result = await getGitHubCommitsSince('o/r', 'commit-abc1234')

    expect(result.anchorFound).toBe(true)
    expect(result.commits).toHaveLength(2)
  })

  it('reports truncated when the fetch limit hides older commits', async () => {
    stubCompare(url => {
      const page = Number(new URL(url).searchParams.get('page'))
      const commits = page <= 3 ? Array.from({ length: 100 }, (_, i) => commit(`p${page}-${i}`)) : []
      return Response.json({ total_commits: 400, commits })
    })

    const result = await getGitHubCommitsSince('o/r', '1.0.0')

    expect(result.commits).toHaveLength(300)
    expect(result.truncated).toBe(true)
    expect(result.totalCommits).toBe(400)
  })

  it('reports anchorFound=false when no ref spelling resolves', async () => {
    stubCompare(() => new Response('not found', { status: 404 }))

    const result = await getGitHubCommitsSince('o/r', '9.9.9')

    expect(result.anchorFound).toBe(false)
    expect(result.commits).toHaveLength(0)
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

    expect(result?.tag).toBe('v0.10.0')
    expect(result?.sha).toBe('newest')
  })

  it('ignores non-release tags', async () => {
    stubTags([
      { name: 'nightly', commit: { sha: 'x' } },
      { name: 'v1.0.0-rc.1', commit: { sha: 'y' } },
      { name: 'v1.0.0', commit: { sha: 'release' } }
    ])

    expect((await getLatestTagSha('o/r'))?.sha).toBe('release')
  })

  it('returns null when no release tags exist', async () => {
    stubTags([])
    expect(await getLatestTagSha('o/r')).toBeNull()
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

    expect(text).toBe('name: radar check')
    expect(seen).toContain('/repos/o/r/contents/action.yml?ref=abc123')
  })

  it('returns null when the file does not exist at the ref', async () => {
    globalThis.fetch = (async (_input: string | URL | Request) =>
      new Response('not found', { status: 404 })) as typeof fetch

    expect(await getGitHubFileText('o/r', 'action.yml', 'abc123')).toBeNull()
  })
})
