/**
 * Research Reports
 *
 * Check updates, list tools, get changelog, suggest features.
 */

import { getGitHubVersion, getGitHubReleasesSince, getGitHubCommits, getGitHubCommitsSince, getGitHubFileText, extractGitHubRepo, getNPMRepoUrl, getPyPIRepoUrl, getNuGetRepoUrl } from './api/index.ts'
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
  type: 'releases' | 'changelog-file' | 'commits'
  releases?: ChangelogRelease[]
  commits?: ChangelogCommit[]
  /** Raw markdown slice of the repo's changelog file (type: changelog-file) */
  markdown?: string
  /** Which file the markdown came from, e.g. CHANGELOG.md */
  path?: string
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
  if (tool.type === 'nuget') {
    return { repo: extractGitHubRepo(await getNuGetRepoUrl(pkg)), bridgedPackage: pkg }
  }
  return { repo: null, bridgedPackage: null }
}

// ─────────────────────────────────────────────────────────────
// Changelog file parsing
// ─────────────────────────────────────────────────────────────

/** A markdown heading that names a release version, e.g. "## [1.2.3] - 2026-01-01" */
const VERSION_HEADING = /^#{1,4}\s.*?\bv?(\d+(?:\.\d+){1,3}(?:-[\w.]+)?)\b/

export interface ChangelogFileSlice {
  markdown: string
  /** version sections included in the slice */
  sections: number
  anchorFound: boolean
  /** true = older sections exist beyond the cap (no-anchor case only) */
  truncated: boolean
}

/**
 * Slice a changelog file down to the sections newer than sinceVersion.
 * Returns null when the file has no recognizable version headings.
 * Mirrors getGitHubReleasesSince semantics: an unfound anchor caps the
 * slice at maxSections and the caller must surface incompleteness.
 */
export function sliceChangelogSince(
  content: string,
  sinceVersion: string | null,
  maxSections = 10
): ChangelogFileSlice | null {
  const lines = content.split(/\r?\n/)
  const headings: Array<{ line: number; version: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(VERSION_HEADING)
    if (match) headings.push({ line: i, version: match[1] })
  }
  if (headings.length === 0) return null

  // One section per heading. Changelogs are usually newest-first, but
  // appended (oldest-first) files exist — taking "before the anchor" in
  // such a file would silently return the OLDEST sections, so detect the
  // order via first/last version and normalize to newest-first.
  const sections = headings.map((h, i) => ({
    version: h.version,
    text: lines.slice(h.line, headings[i + 1]?.line ?? lines.length).join('\n')
  }))
  const num = (v: string): number[] => v.split('.').map(n => parseInt(n, 10))
  const cmpVer = (a: string, b: string): number => {
    const [pa, pb] = [num(a), num(b)]
    return pa[0] - pb[0] || (pa[1] ?? 0) - (pb[1] ?? 0) || (pa[2] ?? 0) - (pb[2] ?? 0)
  }
  if (sections.length > 1 && cmpVer(sections[0].version, sections[sections.length - 1].version) < 0) {
    sections.reverse()
  }

  const target = sinceVersion?.replace(/^v/, '') ?? null
  const anchor = target === null ? -1 : sections.findIndex(s => s.version === target)
  const end = anchor >= 0 ? anchor : Math.min(maxSections, sections.length)

  return {
    markdown: sections.slice(0, end).map(s => s.text).join('\n').trim(),
    sections: end,
    anchorFound: target === null || anchor >= 0,
    truncated: target === null && sections.length > maxSections
  }
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

    // No releases → try the repo's changelog file before bare commits:
    // many projects (npm libs especially) tag without GitHub releases but
    // keep a CHANGELOG.md, which is far better analysis material.
    for (const path of ['CHANGELOG.md', 'CHANGES.md']) {
      const text = await getGitHubFileText(source, path)
      if (!text) continue
      const slice = sliceChangelogSince(text, sinceVersion)
      if (!slice || slice.sections === 0) continue

      let fileWarning: string | undefined
      if (!slice.anchorFound) {
        fileWarning =
          `Anchor version ${sinceVersion} not found in ${path} — ` +
          `showing the ${slice.sections} newest sections; the range may be incomplete.`
      } else if (slice.truncated) {
        fileWarning = `Showing only the ${slice.sections} newest sections of ${path} — older entries omitted.`
      }

      // A bridged package reads the REPO's changelog file — in a monorepo
      // that file (and its version anchors) may belong to other packages
      const bridgeWarning = bridgedPackage
        ? `${path} read from ${source} via the ${bridgedPackage} package bridge — ` +
          'if that repo is a monorepo, sections may cover other packages.'
        : undefined

      return {
        tool,
        type: 'changelog-file',
        path,
        markdown: slice.markdown,
        warning: [fileWarning, bridgeWarning].filter(Boolean).join(' ') || undefined
      }
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
