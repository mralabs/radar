/**
 * Research Module
 *
 * Track and compare external tools in the Claude ecosystem.
 * Check for version updates and generate comparison reports.
 *
 * @example
 * ```typescript
 * import {
 *   loadRegistry,
 *   loadVersions,
 *   checkUpdates,
 *   getChangelog
 * } from 'ai-orchestration'
 *
 * const registry = loadRegistry(registryPath)
 * const versions = loadVersions(versionsPath)
 *
 * const result = await checkUpdates(registry, versions)
 * console.log(`${result.updates.length} updates available`)
 * ```
 */

// Types
export { TOOL_TYPES } from './types.ts'
export type {
  ToolType,
  ToolStatus,
  ToolSource,
  Tool,
  AddToolOptions,
  CategoryInfo,
  Registry,
  VersionData,
  VersionChangeType,
  VersionHistoryEntry,
  Versions,
  VersionResult,
  GitHubRelease,
  GitHubTag,
  GitHubCommit,
  PyPIResponse,
  NPMResponse,
  NuGetResponse,
  CheckOptions,
  ListOptions,
  UpdateInfo,
  UpToDateInfo,
  ErrorInfo,
  CheckResult
} from './types.ts'

// API Clients
export {
  fetchJson,
  getGitHubVersion,
  getGitHubReleases,
  getGitHubCommits,
  getGitHubRateLimit,
  getGitHubFileText,
  getLatestTagSha,
  setGitHubToken,
  getGitHubToken,
  getPyPIVersion,
  getNPMVersion,
  getNuGetVersion
} from './api/index.ts'
export type { FetchOptions } from './api/index.ts'

// Registry
export {
  loadRegistry,
  saveRegistry,
  loadVersions,
  saveVersions
} from './registry.ts'

// Tools
export {
  generateToolId,
  findTool,
  findToolPartial,
  addTool,
  removeTool,
  getToolDetails,
  markAnalyzed
} from './tools.ts'
export type {
  AddToolResult,
  RemoveToolResult,
  ToolDetails,
  MarkAnalyzedResult
} from './tools.ts'

// Reports
export {
  checkUpdates,
  listTools,
  getChangelog
} from './reports.ts'
export type {
  CheckUpdatesCallbacks,
  ToolListItem,
  GroupedTools,
  ListResult,
  ChangelogRelease,
  ChangelogCommit,
  ChangelogResult
} from './reports.ts'

// History
export {
  parseVersion,
  getVersionChangeType,
  isBreakingChange,
  appendVersionHistory,
  getVersionHistory,
  getBreakingChanges,
  getMajorChanges
} from './history.ts'
