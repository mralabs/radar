/**
 * Reports Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdirSync, rmdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { checkUpdates, listTools, suggestFeatures } from '../skills/radar/scripts/core/reports.ts'
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

describe('suggestFeatures', () => {
  const TEST_DIR = '/tmp/comparisons-test'

  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    const files = ['test.json']
    for (const file of files) {
      const path = join(TEST_DIR, file)
      if (existsSync(path)) unlinkSync(path)
    }
    if (existsSync(TEST_DIR)) rmdirSync(TEST_DIR)
  })

  it('should return empty array if directory does not exist', () => {
    const suggestions = suggestFeatures('/non/existent/path', 'my-project')
    expect(suggestions).toEqual([])
  })

  it('should find missing features', () => {
    const comparison = {
      category: 'test-category',
      features: [
        { id: 'feature-1', name: 'Feature 1', description: 'A feature' },
        { id: 'feature-2', name: 'Feature 2', description: 'Another feature' }
      ],
      tools: {
        'my-project': {
          'feature-1': { value: true },
          'feature-2': { value: false }
        },
        'other-tool': {
          'feature-1': { value: true },
          'feature-2': { value: true }
        }
      }
    }

    writeFileSync(join(TEST_DIR, 'test.json'), JSON.stringify(comparison))

    const suggestions = suggestFeatures(TEST_DIR, 'my-project')

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].feature).toBe('feature-2')
    expect(suggestions[0].name).toBe('Feature 2')
    expect(suggestions[0].availableIn).toContain('other-tool')
    expect(suggestions[0].category).toBe('test-category')
  })

  it('should not suggest features we already have', () => {
    const comparison = {
      tools: {
        'my-project': {
          'feature-1': { value: true }
        },
        'other-tool': {
          'feature-1': { value: true }
        }
      }
    }

    writeFileSync(join(TEST_DIR, 'test.json'), JSON.stringify(comparison))

    const suggestions = suggestFeatures(TEST_DIR, 'my-project')
    expect(suggestions).toHaveLength(0)
  })

  it('should handle - value as missing', () => {
    const comparison = {
      tools: {
        'my-project': {
          'feature-1': { value: '-' }
        },
        'other-tool': {
          'feature-1': { value: true }
        }
      }
    }

    writeFileSync(join(TEST_DIR, 'test.json'), JSON.stringify(comparison))

    const suggestions = suggestFeatures(TEST_DIR, 'my-project')
    expect(suggestions).toHaveLength(1)
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
