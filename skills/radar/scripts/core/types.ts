/**
 * Research Module Types
 */

// ─────────────────────────────────────────────────────────────
// Tool Types
// ─────────────────────────────────────────────────────────────

export const TOOL_TYPES = ['github', 'pypi', 'npm', 'nuget'] as const
export type ToolType = (typeof TOOL_TYPES)[number]
export type ToolStatus = 'active' | 'inactive' | 'archived'

export interface ToolSource {
  package?: string
  repo?: string
}

export interface Tool {
  id: string
  name: string
  category: string
  type: ToolType
  source: string | ToolSource
  url: string | null
  description?: string
  status: ToolStatus
  stars?: number
  features?: string[]
  tags?: string[]
  /** Curated analysis context — the agent reads and enriches this */
  notes?: string
}

export interface AddToolOptions {
  name?: string
  category?: string
  description?: string
  tags?: string[]
}

// ─────────────────────────────────────────────────────────────
// Registry Types
// ─────────────────────────────────────────────────────────────

export interface CategoryInfo {
  name: string
  description?: string
}

export interface Registry {
  version: string
  lastUpdated?: string
  categories: Record<string, CategoryInfo>
  tools: Tool[]
}

// ─────────────────────────────────────────────────────────────
// Version Types
// ─────────────────────────────────────────────────────────────

export type VersionChangeType = 'major' | 'minor' | 'patch' | 'prerelease' | 'unknown'

export interface VersionHistoryEntry {
  version: string
  date: string
  type: VersionChangeType
  breaking?: boolean
  highlights?: string[]
}

export interface VersionData {
  currentVersion?: string | null
  lastAnalyzedVersion?: string | null
  latestReleaseDate?: string | null
  lastChecked?: string
  lastAnalyzedDate?: string
  lastError?: string
  /** Version history (append-only) */
  history?: VersionHistoryEntry[]
}

export interface Versions {
  lastChecked: string | null
  tools: Record<string, VersionData>
}

// ─────────────────────────────────────────────────────────────
// API Response Types
// ─────────────────────────────────────────────────────────────

export interface VersionResult {
  version: string | null
  publishedAt: string | null
  error: string | null
}

export interface GitHubRelease {
  tag_name: string
  name?: string
  body?: string
  published_at?: string
}

export interface GitHubTag {
  name: string
}

export interface GitHubCommit {
  sha: string
  commit: {
    author: {
      date?: string
    }
    message: string
  }
}

export interface PyPIResponse {
  info?: {
    version?: string
  }
  releases?: Record<string, Array<{ upload_time?: string }>>
}

export interface NPMResponse {
  'dist-tags'?: {
    latest?: string
  }
  time?: Record<string, string>
}

export interface NuGetResponse {
  versions?: string[]
  // Catalog entry for detailed info
  catalogEntry?: {
    version?: string
    published?: string
  }
}

// ─────────────────────────────────────────────────────────────
// Operation Options
// ─────────────────────────────────────────────────────────────

export interface CheckOptions {
  tool?: string | null
  category?: string | null
}

export interface ListOptions {
  category?: string
  hasUpdates?: boolean
  minStars?: number
}

// ─────────────────────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────────────────────

export interface UpdateInfo {
  tool: Tool
  lastVersion: string
  currentVersion: string
}

export interface UpToDateInfo {
  tool: Tool
  version: string
}

export interface ErrorInfo {
  tool: Tool
  error: string
}

/** Tool seen for the first time: baseline recorded, tracking starts now */
export interface BaselineInfo {
  tool: Tool
  version: string
}

export interface CheckResult {
  updates: UpdateInfo[]
  upToDate: UpToDateInfo[]
  baselined: BaselineInfo[]
  errors: ErrorInfo[]
}
