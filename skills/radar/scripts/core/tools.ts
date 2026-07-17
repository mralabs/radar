/**
 * Tool Management
 *
 * Add, remove, show, and mark tools as analyzed.
 */

import type {
  Tool,
  ToolType,
  Registry,
  Versions,
  VersionData,
  AddToolOptions
} from './types.ts'

// ─────────────────────────────────────────────────────────────
// Tool ID Generation
// ─────────────────────────────────────────────────────────────

/**
 * Generate a unique ID from source string
 */
export function generateToolId(source: string): string {
  return source.replace(/[^a-z0-9]/gi, '-').toLowerCase()
}

// ─────────────────────────────────────────────────────────────
// Find Tool
// ─────────────────────────────────────────────────────────────

/**
 * Find a tool by ID or name (case-insensitive)
 */
export function findTool(registry: Registry, query: string): Tool | undefined {
  return registry.tools.find(
    t => t.id === query || t.name.toLowerCase() === query.toLowerCase()
  )
}

/**
 * Find a tool with partial name match
 */
export function findToolPartial(registry: Registry, query: string): Tool | undefined {
  return registry.tools.find(
    t => t.id === query || t.name.toLowerCase().includes(query.toLowerCase())
  )
}

// ─────────────────────────────────────────────────────────────
// Add Tool
// ─────────────────────────────────────────────────────────────

export interface AddToolResult {
  success: boolean
  tool?: Tool
  error?: string
}

/**
 * Add a new tool to registry
 */
export function addTool(
  registry: Registry,
  type: ToolType,
  source: string,
  options: AddToolOptions = {}
): AddToolResult {
  const id = generateToolId(source)

  // Check if already exists
  if (registry.tools.find(t => t.id === id)) {
    return {
      success: false,
      error: `Tool already tracked: ${id}`
    }
  }

  const newTool: Tool = {
    id,
    name: options.name || source.split('/').pop() || source,
    category: options.category || 'uncategorized',
    type,
    source,
    url: type === 'github' ? `https://github.com/${source}` : null,
    description: options.description ?? '',
    status: 'active',
    features: [],
    tags: options.tags ?? []
  }

  registry.tools.push(newTool)

  return { success: true, tool: newTool }
}

// ─────────────────────────────────────────────────────────────
// Remove Tool
// ─────────────────────────────────────────────────────────────

export interface RemoveToolResult {
  success: boolean
  error?: string
}

/**
 * Remove a tool from registry
 */
export function removeTool(registry: Registry, toolId: string): RemoveToolResult {
  const initialLength = registry.tools.length
  registry.tools = registry.tools.filter(t => t.id !== toolId)

  if (registry.tools.length === initialLength) {
    return { success: false, error: `Tool not found: ${toolId}` }
  }

  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// Get Tool Details
// ─────────────────────────────────────────────────────────────

export interface ToolDetails {
  tool: Tool
  versionData: VersionData
}

/**
 * Get tool with version data
 */
export function getToolDetails(
  registry: Registry,
  versions: Versions,
  toolId: string
): ToolDetails | null {
  const tool = findTool(registry, toolId)

  if (!tool) {
    return null
  }

  const versionData = versions.tools[tool.id] ?? {}

  return { tool, versionData }
}

// ─────────────────────────────────────────────────────────────
// Mark Analyzed
// ─────────────────────────────────────────────────────────────

export interface MarkAnalyzedResult {
  success: boolean
  tool?: Tool
  oldVersion?: string | null
  newVersion?: string
  error?: string
}

/**
 * Mark a tool as analyzed at a specific version
 */
export function markAnalyzed(
  registry: Registry,
  versions: Versions,
  toolId: string,
  version?: string
): MarkAnalyzedResult {
  const tool = findTool(registry, toolId)

  if (!tool) {
    return { success: false, error: `Tool not found: ${toolId}` }
  }

  // Initialize versions entry if needed
  if (!versions.tools[tool.id]) {
    versions.tools[tool.id] = {}
  }

  // Use provided version or fall back to currentVersion
  const newVersion = version ?? versions.tools[tool.id]?.currentVersion ?? null

  if (!newVersion) {
    return {
      success: false,
      error: `No version specified and no currentVersion found`,
      tool
    }
  }

  const oldVersion = versions.tools[tool.id].lastAnalyzedVersion

  versions.tools[tool.id].lastAnalyzedVersion = newVersion
  versions.tools[tool.id].lastAnalyzedDate = new Date().toISOString()

  return {
    success: true,
    tool,
    oldVersion,
    newVersion
  }
}
