/**
 * Tools Management Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test'
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
    expect(generateToolId('anthropics/skills')).toBe('anthropics-skills')
  })

  it('should replace special characters with dashes', () => {
    expect(generateToolId('user@example.com/repo')).toBe('user-example-com-repo')
  })

  it('should handle simple package names', () => {
    expect(generateToolId('langchain')).toBe('langchain')
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
    expect(tool?.name).toBe('Test Tool')
  })

  it('should find tool by name (case-insensitive)', () => {
    const tool = findTool(registry, 'TEST TOOL')
    expect(tool?.id).toBe('test-tool')
  })

  it('should return undefined for non-existent tool', () => {
    expect(findTool(registry, 'no-such-tool')).toBeUndefined()
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
    expect(tool?.id).toBe('claude-code-action')
  })

  it('should be case-insensitive', () => {
    const tool = findToolPartial(registry, 'CLAUDE')
    expect(tool?.id).toBe('claude-code-action')
  })
})

describe('addTool', () => {
  let registry: Registry

  beforeEach(() => {
    registry = { version: '1.0.0', categories: {}, tools: [] }
  })

  it('should add a new github tool', () => {
    const result = addTool(registry, 'github', 'org/repo', { name: 'My Repo' })

    expect(result.success).toBe(true)
    expect(result.tool?.id).toBe('org-repo')
    expect(result.tool?.name).toBe('My Repo')
    expect(result.tool?.type).toBe('github')
    expect(result.tool?.url).toBe('https://github.com/org/repo')
    expect(registry.tools).toHaveLength(1)
  })

  it('should add npm tool without url', () => {
    const result = addTool(registry, 'npm', 'my-package')

    expect(result.success).toBe(true)
    expect(result.tool?.url).toBeNull()
  })

  it('should fail if tool already exists', () => {
    addTool(registry, 'github', 'org/repo')
    const result = addTool(registry, 'github', 'org/repo')

    expect(result.success).toBe(false)
    expect(result.error).toContain('already tracked')
  })

  it('should use default category if not provided', () => {
    const result = addTool(registry, 'pypi', 'my-package')
    expect(result.tool?.category).toBe('uncategorized')
  })

  it('should use custom category and tags', () => {
    const result = addTool(registry, 'github', 'org/repo', {
      category: 'frameworks',
      tags: ['ai', 'ml']
    })

    expect(result.tool?.category).toBe('frameworks')
    expect(result.tool?.tags).toEqual(['ai', 'ml'])
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

    expect(result.success).toBe(true)
    expect(registry.tools).toHaveLength(1)
    expect(registry.tools[0].id).toBe('tool-2')
  })

  it('should fail if tool not found', () => {
    const result = removeTool(registry, 'non-existent')

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
    expect(registry.tools).toHaveLength(2)
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

    expect(details?.tool.name).toBe('My Tool')
    expect(details?.versionData.currentVersion).toBe('2.0.0')
    expect(details?.versionData.lastAnalyzedVersion).toBe('1.5.0')
  })

  it('should return null for non-existent tool', () => {
    expect(getToolDetails(registry, versions, 'no-tool')).toBeNull()
  })

  it('should return empty version data if not tracked', () => {
    const emptyVersions: Versions = { lastChecked: null, tools: {} }
    const details = getToolDetails(registry, emptyVersions, 'my-tool')

    expect(details?.tool.name).toBe('My Tool')
    expect(details?.versionData).toEqual({})
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

    expect(result.success).toBe(true)
    expect(result.newVersion).toBe('2.0.0')
    expect(versions.tools['my-tool'].lastAnalyzedVersion).toBe('2.0.0')
    expect(versions.tools['my-tool'].lastAnalyzedDate).toBeDefined()
  })

  it('should use currentVersion if no version provided', () => {
    const result = markAnalyzed(registry, versions, 'my-tool')

    expect(result.success).toBe(true)
    expect(result.newVersion).toBe('2.0.0')
  })

  it('should fail if tool not found', () => {
    const result = markAnalyzed(registry, versions, 'no-tool')

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('should fail if no version available', () => {
    versions.tools['my-tool'] = {}
    const result = markAnalyzed(registry, versions, 'my-tool')

    expect(result.success).toBe(false)
    expect(result.error).toContain('No version specified')
  })

  it('should track old version', () => {
    versions.tools['my-tool'].lastAnalyzedVersion = '1.0.0'
    const result = markAnalyzed(registry, versions, 'my-tool', '2.0.0')

    expect(result.oldVersion).toBe('1.0.0')
  })
})
