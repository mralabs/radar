/**
 * Tools Management Tests
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateToolId,
  findTool,
  findToolPartial,
  addTool,
  removeTool,
  getToolDetails,
  markAnalyzed
} from '../skills/radar/scripts/core/tools.ts'
import type { Registry, Versions, Tool } from '../skills/radar/scripts/core/types.ts'

describe('generateToolId', () => {
  it('should generate lowercase id from source', () => {
    assert.strictEqual(generateToolId('anthropics/skills'), 'anthropics-skills')
  })

  it('should replace special characters with dashes', () => {
    assert.strictEqual(generateToolId('user@example.com/repo'), 'user-example-com-repo')
  })

  it('should handle simple package names', () => {
    assert.strictEqual(generateToolId('langchain'), 'langchain')
  })
})

describe('findTool', () => {
  const registry: Registry = {
    version: '1.0.0',
    categories: {},
    tools: [
      { id: 'test-tool', name: 'Test Tool', category: 'test', type: 'github', source: 'org/repo', url: null, status: 'active' },
      { id: 'another-tool', name: 'Another Tool', category: 'test', type: 'npm', source: 'another-pkg', url: null, status: 'active' }
    ]
  }

  it('should find tool by id', () => {
    const tool = findTool(registry, 'test-tool')
    assert.strictEqual(tool?.name, 'Test Tool')
  })

  it('should find tool by name (case-insensitive)', () => {
    const tool = findTool(registry, 'TEST TOOL')
    assert.strictEqual(tool?.id, 'test-tool')
  })

  it('should return undefined for non-existent tool', () => {
    assert.strictEqual(findTool(registry, 'no-such-tool'), undefined)
  })
})

describe('findToolPartial', () => {
  const registry: Registry = {
    version: '1.0.0',
    categories: {},
    tools: [
      { id: 'claude-code-action', name: 'Claude Code Action', category: 'official', type: 'github', source: 'org/repo', url: null, status: 'active' }
    ]
  }

  it('should find tool with partial name match', () => {
    const tool = findToolPartial(registry, 'Code Action')
    assert.strictEqual(tool?.id, 'claude-code-action')
  })

  it('should be case-insensitive', () => {
    const tool = findToolPartial(registry, 'CLAUDE')
    assert.strictEqual(tool?.id, 'claude-code-action')
  })
})

describe('addTool', () => {
  let registry: Registry

  beforeEach(() => {
    registry = { version: '1.0.0', categories: {}, tools: [] }
  })

  it('should add a new github tool', () => {
    const result = addTool(registry, 'github', 'org/repo', { name: 'My Repo' })

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.tool?.id, 'org-repo')
    assert.strictEqual(result.tool?.name, 'My Repo')
    assert.strictEqual(result.tool?.type, 'github')
    assert.strictEqual(result.tool?.url, 'https://github.com/org/repo')
    assert.strictEqual(registry.tools.length, 1)
  })

  it('should add npm tool without url', () => {
    const result = addTool(registry, 'npm', 'my-package')

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.tool?.url, null)
  })

  it('should fail if tool already exists', () => {
    addTool(registry, 'github', 'org/repo')
    const result = addTool(registry, 'github', 'org/repo')

    assert.strictEqual(result.success, false)
    assert.ok(result.error?.includes('already tracked'))
  })

  it('should use default category if not provided', () => {
    const result = addTool(registry, 'pypi', 'my-package')
    assert.strictEqual(result.tool?.category, 'uncategorized')
  })

  it('should use custom category and tags', () => {
    const result = addTool(registry, 'github', 'org/repo', {
      category: 'frameworks',
      tags: ['ai', 'ml']
    })

    assert.strictEqual(result.tool?.category, 'frameworks')
    assert.deepStrictEqual(result.tool?.tags, ['ai', 'ml'])
  })
})

describe('removeTool', () => {
  let registry: Registry

  beforeEach(() => {
    registry = {
      version: '1.0.0',
      categories: {},
      tools: [
        { id: 'tool-1', name: 'Tool 1', category: 'test', type: 'github', source: 'a/b', url: null, status: 'active' },
        { id: 'tool-2', name: 'Tool 2', category: 'test', type: 'npm', source: 'pkg', url: null, status: 'active' }
      ]
    }
  })

  it('should remove existing tool', () => {
    const result = removeTool(registry, 'tool-1')

    assert.strictEqual(result.success, true)
    assert.strictEqual(registry.tools.length, 1)
    assert.strictEqual(registry.tools[0].id, 'tool-2')
  })

  it('should fail if tool not found', () => {
    const result = removeTool(registry, 'non-existent')

    assert.strictEqual(result.success, false)
    assert.ok(result.error?.includes('not found'))
    assert.strictEqual(registry.tools.length, 2)
  })
})

describe('getToolDetails', () => {
  const registry: Registry = {
    version: '1.0.0',
    categories: {},
    tools: [
      { id: 'my-tool', name: 'My Tool', category: 'test', type: 'github', source: 'org/repo', url: null, status: 'active' }
    ]
  }

  const versions: Versions = {
    lastChecked: null,
    tools: {
      'my-tool': {
        currentVersion: '2.0.0',
        lastAnalyzedVersion: '1.5.0',
        latestReleaseDate: '2024-01-15'
      }
    }
  }

  it('should return tool with version data', () => {
    const details = getToolDetails(registry, versions, 'my-tool')

    assert.strictEqual(details?.tool.name, 'My Tool')
    assert.strictEqual(details?.versionData.currentVersion, '2.0.0')
    assert.strictEqual(details?.versionData.lastAnalyzedVersion, '1.5.0')
  })

  it('should return null for non-existent tool', () => {
    assert.strictEqual(getToolDetails(registry, versions, 'no-tool'), null)
  })

  it('should return empty version data if not tracked', () => {
    const emptyVersions: Versions = { lastChecked: null, tools: {} }
    const details = getToolDetails(registry, emptyVersions, 'my-tool')

    assert.strictEqual(details?.tool.name, 'My Tool')
    assert.deepStrictEqual(details?.versionData, {})
  })
})

describe('markAnalyzed', () => {
  let registry: Registry
  let versions: Versions

  beforeEach(() => {
    registry = {
      version: '1.0.0',
      categories: {},
      tools: [
        { id: 'my-tool', name: 'My Tool', category: 'test', type: 'github', source: 'org/repo', url: null, status: 'active' }
      ]
    }
    versions = {
      lastChecked: null,
      tools: {
        'my-tool': { currentVersion: '2.0.0' }
      }
    }
  })

  it('should mark tool as analyzed with provided version', () => {
    const result = markAnalyzed(registry, versions, 'my-tool', '2.0.0')

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.newVersion, '2.0.0')
    assert.strictEqual(versions.tools['my-tool'].lastAnalyzedVersion, '2.0.0')
    assert.notStrictEqual(versions.tools['my-tool'].lastAnalyzedDate, undefined)
  })

  it('should use currentVersion if no version provided', () => {
    const result = markAnalyzed(registry, versions, 'my-tool')

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.newVersion, '2.0.0')
  })

  it('should fail if tool not found', () => {
    const result = markAnalyzed(registry, versions, 'no-tool')

    assert.strictEqual(result.success, false)
    assert.ok(result.error?.includes('not found'))
  })

  it('should fail if no version available', () => {
    versions.tools['my-tool'] = {}
    const result = markAnalyzed(registry, versions, 'my-tool')

    assert.strictEqual(result.success, false)
    assert.ok(result.error?.includes('No version specified'))
  })

  it('should track old version', () => {
    versions.tools['my-tool'].lastAnalyzedVersion = '1.0.0'
    const result = markAnalyzed(registry, versions, 'my-tool', '2.0.0')

    assert.strictEqual(result.oldVersion, '1.0.0')
  })
})
