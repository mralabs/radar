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
export { TOOL_TYPES } from './types'
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
  CheckResult,
  DiscoveryResult,
  FeatureValue,
  FeatureDefinition,
  ComparisonData,
  Suggestion
} from './types'

// API Clients
export {
  fetchJson,
  getGitHubVersion,
  getGitHubReleases,
  getGitHubCommits,
  getGitHubRateLimit,
  setGitHubToken,
  getGitHubToken,
  getPyPIVersion,
  getNPMVersion,
  getNuGetVersion
} from './api'
export type { FetchOptions } from './api'

// Registry
export {
  loadRegistry,
  saveRegistry,
  loadVersions,
  saveVersions
} from './registry'

// Tools
export {
  generateToolId,
  findTool,
  findToolPartial,
  addTool,
  removeTool,
  getToolDetails,
  markAnalyzed
} from './tools'
export type {
  AddToolResult,
  RemoveToolResult,
  ToolDetails,
  MarkAnalyzedResult
} from './tools'

// Reports
export {
  checkUpdates,
  listTools,
  getChangelog,
  suggestFeatures
} from './reports'
export type {
  CheckUpdatesCallbacks,
  ToolListItem,
  GroupedTools,
  ListResult,
  ChangelogRelease,
  ChangelogCommit,
  ChangelogResult
} from './reports'

// History
export {
  parseVersion,
  getVersionChangeType,
  isBreakingChange,
  appendVersionHistory,
  getVersionHistory,
  getBreakingChanges,
  getMajorChanges
} from './history'

// Discovery
export {
  discoverFromGitHub,
  discoverFromAwesomeLists,
  discoverTools
} from './discovery'
export type {
  DiscoveryCallbacks,
  DiscoveryOptions
} from './discovery'

// Features
export {
  extractToolFeatures,
  compareFeatures
} from './features'
export type {
  ExtractedFeatures
} from './features'
