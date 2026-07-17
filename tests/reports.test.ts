/**
 * Reports Tests
 */

import { describe, it, expect, afterEach } from 'bun:test'
import { checkUpdates, listTools, getChangelog, sliceChangelogSince } from '../skills/radar/scripts/core/reports.ts'
import type { Registry, Versions } from '../skills/radar/scripts/core/types.ts'

describe('listTools', () => {
  const registry: Registry = {
    version: '1.0.0',
    categories: {
      official: { name: 'Official Tools' },
      community: { name: 'Community Tools' }
    },
    tools: [
      { id: 'tool-a', name: 'Tool A', category: 'official', type: 'github', source: 'a/b', url: null, status: 'active' },
      { id: 'tool-b', name: 'Tool B', category: 'official', type: 'npm', source: 'pkg-b', url: null, status: 'active' },
      { id: 'tool-c', name: 'Tool C', category: 'community', type: 'pypi', source: 'pkg-c', url: null, status: 'active' }
    ]
  }

  const versions: Versions = {
    lastChecked: '2024-01-01T00:00:00.000Z',
    tools: {
      'tool-a': {
        currentVersion: '2.0.0',
        lastAnalyzedVersion: '1.0.0',
        latestReleaseDate: '2024-01-15'
      },
      'tool-b': {
        currentVersion: '1.0.0',
        lastAnalyzedVersion: '1.0.0',
        latestReleaseDate: '2023-01-01' // Old, stale
      },
      'tool-c': {
        currentVersion: '3.0.0',
        lastAnalyzedVersion: '3.0.0'
      }
    }
  }

  it('should return grouped tools', () => {
    const result = listTools(registry, versions)

    expect(result.totalTools).toBe(3)
    expect(result.groups).toHaveLength(2)
  })

  it('should include category names', () => {
    const result = listTools(registry, versions)
    const officialGroup = result.groups.find(g => g.category === 'official')

    expect(officialGroup?.categoryName).toBe('Official Tools')
  })

  it('should detect tools with updates', () => {
    const result = listTools(registry, versions)
    const items = result.groups.flatMap(g => g.tools)
    const toolA = items.find(i => i.tool.id === 'tool-a')

    expect(toolA?.hasUpdate).toBe(true)
    expect(toolA?.currentVersion).toBe('2.0.0')
    expect(toolA?.lastAnalyzedVersion).toBe('1.0.0')
  })

  it('should detect stale tools', () => {
    const result = listTools(registry, versions)
    const items = result.groups.flatMap(g => g.tools)
    const toolB = items.find(i => i.tool.id === 'tool-b')

    expect(toolB?.isStale).toBe(true)
    expect(result.staleCount).toBeGreaterThan(0)
  })

  it('should filter by category', () => {
    const result = listTools(registry, versions, { category: 'official' })

    expect(result.totalTools).toBe(2)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].category).toBe('official')
  })

  it('should filter by hasUpdates', () => {
    const result = listTools(registry, versions, { hasUpdates: true })

    expect(result.totalTools).toBe(1)
    expect(result.groups.flatMap(g => g.tools)[0].tool.id).toBe('tool-a')
  })
})

describe('sliceChangelogSince', () => {
  const CHANGELOG = [
    '# Changelog',
    '',
    'All notable changes.',
    '',
    '## [2.1.0] - 2026-06-01',
    '- feat: two-one',
    '',
    '## [2.0.0] - 2026-05-01',
    '- breaking: two-oh',
    '',
    '## [1.9.0] - 2026-04-01',
    '- fix: one-nine',
    ''
  ].join('\n')

  it('slices everything newer than the anchor version', () => {
    const slice = sliceChangelogSince(CHANGELOG, '2.0.0')

    expect(slice?.anchorFound).toBe(true)
    expect(slice?.sections).toBe(1)
    expect(slice?.markdown).toContain('two-one')
    expect(slice?.markdown).not.toContain('two-oh')
  })

  it('matches v-prefixed anchors against unprefixed headings', () => {
    const slice = sliceChangelogSince(CHANGELOG, 'v1.9.0')

    expect(slice?.anchorFound).toBe(true)
    expect(slice?.sections).toBe(2)
  })

  it('drops the preamble above the first version heading', () => {
    const slice = sliceChangelogSince(CHANGELOG, '2.0.0')
    expect(slice?.markdown).not.toContain('All notable changes')
  })

  it('reports anchorFound=false and caps sections when the anchor is missing', () => {
    const slice = sliceChangelogSince(CHANGELOG, '0.5.0', 2)

    expect(slice?.anchorFound).toBe(false)
    expect(slice?.sections).toBe(2)
    expect(slice?.markdown).not.toContain('one-nine')
  })

  it('anchor at the top yields zero new sections', () => {
    const slice = sliceChangelogSince(CHANGELOG, '2.1.0')
    expect(slice?.sections).toBe(0)
    expect(slice?.markdown).toBe('')
  })

  it('returns null when no version headings exist', () => {
    expect(sliceChangelogSince('# Notes\n\njust prose\n', '1.0.0')).toBeNull()
  })

  it('ignores non-version headings like "### Changed"', () => {
    const kac = '## [1.1.0] - 2026-01-01\n### Changed\n- stuff\n## [1.0.0] - 2025-12-01\n- init\n'
    const slice = sliceChangelogSince(kac, '1.0.0')

    expect(slice?.sections).toBe(1)
    expect(slice?.markdown).toContain('### Changed')
  })

  it('handles oldest-first (appended) changelogs', () => {
    const asc = '## 1.0.0\n- old\n## 2.0.0\n- mid\n## 3.0.0\n- new\n'
    const slice = sliceChangelogSince(asc, '2.0.0')

    expect(slice?.anchorFound).toBe(true)
    expect(slice?.sections).toBe(1)
    expect(slice?.markdown).toContain('- new')
    expect(slice?.markdown).not.toContain('- mid')
    expect(slice?.markdown).not.toContain('- old')
  })

  it('oldest-first without anchor returns the newest sections, flagged truncated', () => {
    const asc = '## 1.0.0\n- old\n## 2.0.0\n- mid\n## 3.0.0\n- new\n'
    const slice = sliceChangelogSince(asc, null, 2)

    expect(slice?.markdown).toContain('- new')
    expect(slice?.markdown).toContain('- mid')
    expect(slice?.markdown).not.toContain('- old')
    expect(slice?.truncated).toBe(true)
  })

  it('handles plain "## 1.2.3 (date)" heading style', () => {
    const log = '## 2.0.0 (2026-02-02)\n- new\n## 1.0.0 (2026-01-01)\n- old\n'
    const slice = sliceChangelogSince(log, '1.0.0')

    expect(slice?.anchorFound).toBe(true)
    expect(slice?.markdown).toContain('- new')
    expect(slice?.markdown).not.toContain('- old')
  })
})

describe('getChangelog — changelog file fallback', () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const registry: Registry = {
    version: '1.0.0',
    categories: { deps: { name: 'Deps' } },
    tools: [
      { id: 'lib', name: 'Lib', category: 'deps', type: 'github', source: 'o/r', url: null, status: 'active' }
    ]
  }

  const versions: Versions = {
    lastChecked: null,
    tools: { lib: { currentVersion: '2.0.0', lastAnalyzedVersion: '1.0.0' } }
  }

  it('serves CHANGELOG.md when the repo has no releases', async () => {
    const changelog = '## 2.0.0\n- new stuff\n## 1.0.0\n- old stuff\n'
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/releases')) return Response.json([])
      if (url.includes('/contents/CHANGELOG.md')) {
        return Response.json({
          content: Buffer.from(changelog).toString('base64'),
          encoding: 'base64'
        })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const result = await getChangelog(registry, 'lib', versions)

    expect(result?.type).toBe('changelog-file')
    expect(result?.path).toBe('CHANGELOG.md')
    expect(result?.markdown).toContain('new stuff')
    expect(result?.markdown).not.toContain('old stuff')
    expect(result?.warning).toBeUndefined()
  })

  it('warns when the anchor is missing from the changelog file', async () => {
    const changelog = '## 2.0.0\n- new\n## 1.5.0\n- mid\n'
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/releases')) return Response.json([])
      if (url.includes('/contents/CHANGELOG.md')) {
        return Response.json({
          content: Buffer.from(changelog).toString('base64'),
          encoding: 'base64'
        })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const result = await getChangelog(registry, 'lib', versions)

    expect(result?.type).toBe('changelog-file')
    expect(result?.warning).toContain('may be incomplete')
  })

  it('flags the monorepo risk when the changelog comes via a package bridge', async () => {
    const npmRegistry: Registry = {
      version: '1.0.0',
      categories: { deps: { name: 'Deps' } },
      tools: [
        { id: 'pkg', name: 'Pkg', category: 'deps', type: 'npm', source: 'left-pad', url: null, status: 'active' }
      ]
    }
    const npmVersions: Versions = {
      lastChecked: null,
      tools: { pkg: { currentVersion: '2.0.0', lastAnalyzedVersion: '1.0.0' } }
    }
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('registry.npmjs.org/left-pad')) {
        return Response.json({ repository: { url: 'https://github.com/o/mono' } })
      }
      if (url.includes('/releases')) return Response.json([])
      if (url.includes('/contents/CHANGELOG.md')) {
        return Response.json({
          content: Buffer.from('## 2.0.0\n- new\n## 1.0.0\n- old\n').toString('base64'),
          encoding: 'base64'
        })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const result = await getChangelog(npmRegistry, 'pkg', npmVersions)

    expect(result?.type).toBe('changelog-file')
    expect(result?.warning).toContain('monorepo')
  })

  it('falls through to commits when no changelog file exists', async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/releases')) return Response.json([])
      if (url.includes('/contents/')) return new Response('not found', { status: 404 })
      if (url.includes('/compare/')) {
        return Response.json({
          total_commits: 1,
          commits: [{ sha: 'abc1234', commit: { author: { date: '2026-01-01' }, message: 'fix' } }]
        })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const result = await getChangelog(registry, 'lib', versions)

    expect(result?.type).toBe('commits')
    expect(result?.commits).toHaveLength(1)
  })
})

describe('checkUpdates baseline lifecycle', () => {
  const makeRegistry = (): Registry => ({
    version: '1.0.0',
    categories: { official: { name: 'Official' } },
    tools: [
      { id: 'tool-x', name: 'Tool X', category: 'official', type: 'github', source: 'x/y', url: null, status: 'active' }
    ]
  })

  const fetcherReturning = (version: string) => async () => ({
    version,
    publishedAt: '2026-01-01',
    error: null
  })

  it('first check records baseline as NEW, not up-to-date', async () => {
    const versions: Versions = { lastChecked: null, tools: {} }

    const result = await checkUpdates(makeRegistry(), versions, {}, undefined, fetcherReturning('1.0.0'))

    expect(result.baselined).toHaveLength(1)
    expect(result.baselined[0].version).toBe('1.0.0')
    expect(result.updates).toHaveLength(0)
    expect(result.upToDate).toHaveLength(0)
    expect(versions.tools['tool-x'].lastAnalyzedVersion).toBe('1.0.0')
  })

  it('same version after baseline is up-to-date', async () => {
    const versions: Versions = { lastChecked: null, tools: {} }
    const registry = makeRegistry()

    await checkUpdates(registry, versions, {}, undefined, fetcherReturning('1.0.0'))
    const second = await checkUpdates(registry, versions, {}, undefined, fetcherReturning('1.0.0'))

    expect(second.baselined).toHaveLength(0)
    expect(second.updates).toHaveLength(0)
    expect(second.upToDate).toHaveLength(1)
  })

  it('new version after baseline fires UPDATE (the P0 deadlock)', async () => {
    const versions: Versions = { lastChecked: null, tools: {} }
    const registry = makeRegistry()

    await checkUpdates(registry, versions, {}, undefined, fetcherReturning('1.0.0'))
    const second = await checkUpdates(registry, versions, {}, undefined, fetcherReturning('2.0.0'))

    expect(second.updates).toHaveLength(1)
    expect(second.updates[0].lastVersion).toBe('1.0.0')
    expect(second.updates[0].currentVersion).toBe('2.0.0')
  })

  it('failed fetch preserves last-known state and reports an error', async () => {
    const versions: Versions = { lastChecked: null, tools: {} }
    const registry = makeRegistry()

    await checkUpdates(registry, versions, {}, undefined, fetcherReturning('1.0.0'))
    const failing = async () => ({ version: null, publishedAt: null, error: 'rate limited' })
    const second = await checkUpdates(registry, versions, {}, undefined, failing)

    expect(second.errors).toHaveLength(1)
    expect(versions.tools['tool-x'].currentVersion).toBe('1.0.0')
    expect(versions.tools['tool-x'].lastAnalyzedVersion).toBe('1.0.0')
  })
})
