/**
 * Research Reports
 *
 * Check updates, list tools, get changelog, suggest features.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getGitHubVersion, getGitHubReleasesSince, getGitHubCommits, getGitHubCommitsSince, extractGitHubRepo, getNPMRepoUrl, getPyPIRepoUrl } from './api/index.ts'
import { getPyPIVersion } from './api/index.ts'
import { getNPMVersion } from './api/index.ts'
import { getNuGetVersion } from './api/index.ts'
import type {
  Tool,
  Registry,
  Versions,
  VersionResult,
  CheckOptions,
  ListOptions,
  CheckResult,
  UpdateInfo,
  UpToDateInfo,
  BaselineInfo,
  ErrorInfo,
  ComparisonData,
  Suggestion,
  GitHubRelease,
  GitHubCommit
} from './types.ts'
import { appendVersionHistory, getVersionChangeType } from './history.ts'

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** 6 months in milliseconds */
const STALE_THRESHOLD = 180 * 24 * 60 * 60 * 1000
export const MIN_STARS_THRESHOLD = 500

// ─────────────────────────────────────────────────────────────
// Version Fetching
// ─────────────────────────────────────────────────────────────

/**
 * Get package name from tool source
 */
function getPackageName(tool: Tool): string | null {
  if (typeof tool.source === 'string') {
    return tool.source
  }

  if (typeof tool.source === 'object' && tool.source.package) {
    return tool.source.package
  }

  return null
}

/**
 * Fetch version for a tool based on its type
 */
async function fetchVersion(tool: Tool): Promise<VersionResult> {
  const pkg = getPackageName(tool)

  switch (tool.type) {
    case 'github': {
      // github tools may declare { repo } instead of { package }
      const repo =
        typeof tool.source === 'object' ? tool.source.repo ?? pkg : pkg
      return repo ? getGitHubVersion(repo) : { version: null, publishedAt: null, error: 'no source' }
    }

    case 'pypi':
      return pkg ? getPyPIVersion(pkg) : { version: null, publishedAt: null, error: 'no source' }

    case 'npm':
      return pkg ? getNPMVersion(pkg) : { version: null, publishedAt: null, error: 'no source' }

    case 'nuget':
      return pkg ? getNuGetVersion(pkg) : { version: null, publishedAt: null, error: 'no source' }

    default:
      return { version: null, publishedAt: null, error: `unknown type: ${tool.type}` }
  }
}

// ─────────────────────────────────────────────────────────────
// Check Updates
// ─────────────────────────────────────────────────────────────

export interface CheckUpdatesCallbacks {
  onToolStart?: (tool: Tool) => void
  onToolResult?: (tool: Tool, result: VersionResult, hasUpdate: boolean, isNew?: boolean) => void
}

/** Injectable for tests — production callers use the default fetchVersion */
export type VersionFetcher = (tool: Tool) => Promise<VersionResult>

/**
 * Check for updates across tracked tools
 *
 * Updates registry and versions data in place.
 */
export async function checkUpdates(
  registry: Registry,
  versions: Versions,
  options: CheckOptions = {},
  callbacks?: CheckUpdatesCallbacks,
  fetcher: VersionFetcher = fetchVersion
): Promise<CheckResult> {
  const { tool: specificTool, category: specificCategory } = options

  // Retired tools stay in the registry for reference but are not checked
  let tools = registry.tools.filter(t => t.status === 'active')

  // Filter by specific tool
  if (specificTool) {
    tools = tools.filter(
      t => t.id === specificTool || t.name.toLowerCase().includes(specificTool.toLowerCase())
    )
  }

  // Filter by category
  if (specificCategory) {
    tools = tools.filter(t => t.category === specificCategory)
  }

  const updates: UpdateInfo[] = []
  const upToDate: UpToDateInfo[] = []
  const baselined: BaselineInfo[] = []
  const errors: ErrorInfo[] = []

  const checkOne = async (tool: Tool): Promise<void> => {
    callbacks?.onToolStart?.(tool)

    try {
      const result = await fetcher(tool)
      const { version: currentVersion, publishedAt, error: apiError } = result

      // Update versions tracking
      if (!versions.tools[tool.id]) {
        versions.tools[tool.id] = {}
      }

      versions.tools[tool.id].lastChecked = new Date().toISOString()

      // A failed fetch (rate limit, network) must not wipe last-known state
      if (currentVersion === null) {
        versions.tools[tool.id].lastError = apiError ?? 'No version returned'
        errors.push({ tool, error: apiError ?? 'No version returned' })
        callbacks?.onToolResult?.(tool, result, false)
        return
      }

      versions.tools[tool.id].currentVersion = currentVersion
      versions.tools[tool.id].latestReleaseDate = publishedAt

      if (apiError) {
        versions.tools[tool.id].lastError = apiError
      } else {
        delete versions.tools[tool.id].lastError
      }

      // Append to version history if this is a new version
      if (currentVersion) {
        appendVersionHistory(versions.tools[tool.id], currentVersion, publishedAt)
      }

      const versionData = versions.tools[tool.id]
      const lastVersion = versionData.lastAnalyzedVersion ?? null

      // First sighting: record a baseline so future diffs have an anchor.
      // Without this, a tool that is never analyzed reports "up to date"
      // forever (updates only fire against lastAnalyzedVersion).
      if (!lastVersion) {
        versionData.lastAnalyzedVersion = currentVersion
        baselined.push({ tool, version: currentVersion })
        callbacks?.onToolResult?.(tool, result, false, true)
        return
      }

      const hasUpdate = currentVersion !== lastVersion

      callbacks?.onToolResult?.(tool, result, hasUpdate)

      if (hasUpdate) {
        updates.push({ tool, lastVersion, currentVersion })
      } else {
        upToDate.push({ tool, version: currentVersion })
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      errors.push({ tool, error })
    }
  }

  // Worker pool: sequential checks take minutes on large registries.
  // Concurrency 8 stays polite to the APIs while cutting wall-clock ~8x.
  const CONCURRENCY = 8
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < tools.length) {
      await checkOne(tools[next++])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, tools.length) }, worker)
  )

  return { updates, upToDate, baselined, errors }
}

// ─────────────────────────────────────────────────────────────
// List Tools
// ─────────────────────────────────────────────────────────────

export interface ToolListItem {
  tool: Tool
  currentVersion: string | null
  lastAnalyzedVersion: string | null
  releaseDate: string | null
  hasUpdate: boolean
  isStale: boolean
  isLowStar: boolean
}

export interface GroupedTools {
  category: string
  categoryName: string
  tools: ToolListItem[]
}

export interface ListResult {
  groups: GroupedTools[]
  totalTools: number
  staleCount: number
  lowStarCount: number
}

/**
 * Get a grouped list of tools with their status
 */
export function listTools(
  registry: Registry,
  versions: Versions,
  options: ListOptions = {}
): ListResult {
  const { category, hasUpdates, minStars } = options
  const starThreshold = minStars ?? MIN_STARS_THRESHOLD

  let tools = [...registry.tools]

  if (category) {
    tools = tools.filter(t => t.category === category)
  }

  if (hasUpdates) {
    tools = tools.filter(t => {
      const vd = versions.tools[t.id]
      return vd?.currentVersion && vd?.lastAnalyzedVersion && vd.currentVersion !== vd.lastAnalyzedVersion
    })
  }

  // Build tool items
  const items: ToolListItem[] = tools.map(tool => {
    const vd = versions.tools[tool.id] ?? {}
    const currentVersion = vd.currentVersion ?? null
    const lastAnalyzedVersion = vd.lastAnalyzedVersion ?? null
    const releaseDate = vd.latestReleaseDate ?? null

    const hasUpdate = Boolean(
      currentVersion && lastAnalyzedVersion && currentVersion !== lastAnalyzedVersion
    )

    const isStale = Boolean(
      releaseDate && (Date.now() - new Date(releaseDate).getTime()) > STALE_THRESHOLD
    )

    const isLowStar = typeof tool.stars === 'number' && tool.stars < starThreshold

    return { tool, currentVersion, lastAnalyzedVersion, releaseDate, hasUpdate, isStale, isLowStar }
  })

  // Group by category
  const grouped: Record<string, ToolListItem[]> = {}
  for (const item of items) {
    const cat = item.tool.category
    if (!grouped[cat]) {
      grouped[cat] = []
    }
    grouped[cat].push(item)
  }

  // Build result
  const groups: GroupedTools[] = Object.entries(grouped).map(([cat, catTools]) => ({
    category: cat,
    categoryName: registry.categories[cat]?.name ?? cat,
    tools: catTools
  }))

  const staleCount = items.filter(i => i.isStale).length
  const lowStarCount = items.filter(i => i.isLowStar).length

  return { groups, totalTools: tools.length, staleCount, lowStarCount }
}

// ─────────────────────────────────────────────────────────────
// Changelog
// ─────────────────────────────────────────────────────────────

export interface ChangelogRelease {
  tag: string
  name?: string
  date?: string
  body: string[]
}

export interface ChangelogCommit {
  sha: string
  date?: string
  message: string
}

export interface ChangelogResult {
  tool: Tool
  type: 'releases' | 'commits'
  releases?: ChangelogRelease[]
  commits?: ChangelogCommit[]
  /** Set when the result may be incomplete — surface this, never hide it */
  warning?: string
  error?: string
}

/**
 * Resolve the GitHub repo to read release notes from. github tools use
 * their source directly; npm/pypi packages bridge via registry metadata —
 * bridgedPackage is set only then, and scopes monorepo tag matching to the
 * tracked package.
 */
async function resolveChangelogRepo(
  tool: Tool
): Promise<{ repo: string | null; bridgedPackage: string | null }> {
  if (tool.type === 'github') {
    const repo = typeof tool.source === 'string' ? tool.source : tool.source.repo ?? null
    return { repo, bridgedPackage: null }
  }

  const pkg = typeof tool.source === 'string' ? tool.source : tool.source.package
  if (!pkg) return { repo: null, bridgedPackage: null }

  if (tool.type === 'npm') {
    return { repo: extractGitHubRepo(await getNPMRepoUrl(pkg)), bridgedPackage: pkg }
  }
  if (tool.type === 'pypi') {
    return { repo: extractGitHubRepo(await getPyPIRepoUrl(pkg)), bridgedPackage: pkg }
  }
  return { repo: null, bridgedPackage: null }
}

/**
 * Get changelog/release notes for a tool.
 *
 * The analysis range is lastAnalyzedVersion → newest: releases are
 * paginated back to the anchor so nothing in the range is lost, and
 * bodies are returned untruncated — the agent decides what matters.
 */
export async function getChangelog(
  registry: Registry,
  toolId: string,
  versions?: Versions
): Promise<ChangelogResult | null> {
  const tool = registry.tools.find(
    t => t.id === toolId || t.name.toLowerCase().includes(toolId.toLowerCase())
  )

  if (!tool) {
    return null
  }

  const { repo: source, bridgedPackage } = await resolveChangelogRepo(tool)

  if (!source) {
    return {
      tool,
      type: 'releases',
      error: `No GitHub repo resolvable for ${tool.name} (type: ${tool.type})`
    }
  }

  const sinceVersion = versions?.tools[tool.id]?.lastAnalyzedVersion ?? null

  try {
    const { releases, anchorFound, truncated } = await getGitHubReleasesSince(
      source,
      sinceVersion,
      5,
      bridgedPackage
    )

    let warning: string | undefined
    if (sinceVersion && !anchorFound) {
      warning =
        `Anchor version ${sinceVersion} not found among ${source} release tags — ` +
        `showing the ${releases.length} newest releases; the range may be incomplete.`
    } else if (truncated) {
      warning = `Release list truncated at ${releases.length} — older entries not fetched.`
    }

    if (releases.length > 0) {
      const changelogReleases: ChangelogRelease[] = releases.map((r: GitHubRelease) => ({
        tag: r.tag_name,
        name: r.name && r.name !== r.tag_name ? r.name : undefined,
        date: r.published_at?.slice(0, 10),
        body: r.body
          ? r.body
              .replace(/\r\n/g, '\n')
              .split('\n')
              .filter(line => line.trim())
          : []
      }))

      return { tool, type: 'releases', releases: changelogReleases, warning }
    }

    // Fall back to commits. With an anchor, the compare API covers the
    // exact range; without one (or if the ref is gone) a fixed window is
    // all we have — and that is said out loud, never implied complete.
    let commits: GitHubCommit[]
    let commitWarning: string | undefined

    const sinceResult = sinceVersion ? await getGitHubCommitsSince(source, sinceVersion) : null

    if (sinceResult?.anchorFound) {
      commits = sinceResult.commits
      if (sinceResult.truncated) {
        commitWarning =
          `Showing ${commits.length} of ${sinceResult.totalCommits} commits since ` +
          `${sinceVersion} — radar's commit fetch limit reached; oldest commits omitted.`
      }
    } else {
      const COMMIT_WINDOW = 10
      commits = await getGitHubCommits(source, COMMIT_WINDOW)
      if (commits.length > 0) {
        commitWarning =
          `No releases found and anchor ${sinceVersion ?? '(none)'} not resolvable — ` +
          `showing only the latest ${commits.length} commits; the range may be incomplete.`
      }
    }

    if (commits.length > 0) {
      const changelogCommits: ChangelogCommit[] = commits.map((c: GitHubCommit) => ({
        sha: c.sha.slice(0, 7),
        date: c.commit.author.date?.slice(0, 10),
        message: c.commit.message.split('\n')[0]
      }))

      return {
        tool,
        type: 'commits',
        commits: changelogCommits,
        warning: [warning, commitWarning].filter(Boolean).join(' ') || undefined
      }
    }

    return { tool, type: 'releases', releases: [], warning }
  } catch (err) {
    return {
      tool,
      type: 'releases',
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Suggest Features
// ─────────────────────────────────────────────────────────────

/**
 * Suggest features based on comparison data
 */
export function suggestFeatures(comparisonsDir: string, selfId: string): Suggestion[] {
  if (!existsSync(comparisonsDir)) {
    return []
  }

  const files = readdirSync(comparisonsDir).filter(f => f.endsWith('.json'))
  const suggestions: Suggestion[] = []

  for (const file of files) {
    try {
      const content = readFileSync(join(comparisonsDir, file), 'utf8')
      const comparison = JSON.parse(content) as ComparisonData
      const ourTool = comparison.tools?.[selfId]

      if (!ourTool) continue

      for (const [featureId, featureValue] of Object.entries(ourTool)) {
        if (featureValue.value === false || featureValue.value === '-') {
          // Find who has this feature
          const hasFeature = Object.entries(comparison.tools ?? {})
            .filter(([id, t]) => {
              const toolFeatures = t as Record<string, { value: unknown }>
              return id !== selfId && toolFeatures[featureId]?.value === true
            })
            .map(([id]) => id)

          if (hasFeature.length > 0) {
            const featureDef = comparison.features?.find(f => f.id === featureId)
            suggestions.push({
              feature: featureId,
              name: featureDef?.name ?? featureId,
              description: featureDef?.description ?? '',
              availableIn: hasFeature,
              category: comparison.category
            })
          }
        }
      }
    } catch {
      // Skip invalid files
    }
  }

  return suggestions
}
