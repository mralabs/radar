#!/usr/bin/env bun
/**
 * radar CLI
 *
 * Thin CLI wrapper for the radar core module. Data lives in the CONSUMING
 * repo under .radar/ (cwd-relative) so one skill install serves any repo.
 */

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, rmSync, renameSync } from 'node:fs'
import {
  TOOL_TYPES,
  loadRegistry,
  saveRegistry,
  loadVersions,
  saveVersions,
  checkUpdates,
  listTools,
  getChangelog,
  suggestFeatures,
  addTool,
  removeTool,
  getToolDetails,
  markAnalyzed,
  setGitHubToken,
  getGitHubToken,
  getGitHubRateLimit,
  getVersionHistory,
  getBreakingChanges,
  extractToolFeatures,
  compareFeatures,
  discoverTools
} from './core'
import type { Tool, ToolType, VersionHistoryEntry } from './core'

// ─────────────────────────────────────────────────────────────
// Paths — all data lives in the consuming repo's .radar/ dir
// ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(__dirname, '..', 'templates')
const RADAR_DIR = join(process.cwd(), '.radar')
const REGISTRY_PATH = join(RADAR_DIR, 'registry.json')
const VERSIONS_PATH = join(RADAR_DIR, 'versions.json')
const COMPARISONS_DIR = join(RADAR_DIR, 'comparisons')
const CONFIG_PATH = join(RADAR_DIR, 'config.json')

interface RadarConfig {
  /** This repo's own id inside comparison tables (used by `suggest`) */
  selfId?: string
}

function loadConfig(): RadarConfig {
  if (!existsSync(CONFIG_PATH)) return {}
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as RadarConfig
  } catch {
    return {}
  }
}

// ─────────────────────────────────────────────────────────────
// Colors
// ─────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BLUE = '\x1b[34m'
const RED = '\x1b[31m'
const NC = '\x1b[0m'

function log(color: string, message: string): void {
  console.log(`${color}${message}${NC}`)
}

/**
 * Load .env file if exists (zero-dependency implementation)
 */
function loadEnvFile(): void {
  // Check project root for .env
  const envPath = join(process.cwd(), '.env')
  if (!existsSync(envPath)) return

  try {
    const content = readFileSync(envPath, 'utf8')
    const lines = content.split('\n')

    for (const line of lines) {
      // Skip comments and empty lines
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      // Parse KEY=VALUE
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }

        // Only set if not already in environment
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  } catch {
    // Silently ignore errors
  }
}

/**
 * Initialize GitHub token from environment only — never from files, so a
 * secret can't end up in the git-tracked .radar/config.json
 */
function initGitHubToken(): void {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  if (token) {
    setGitHubToken(token)
  }
}

// ─────────────────────────────────────────────────────────────
// CLI Commands
// ─────────────────────────────────────────────────────────────

function getArg(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null
}

async function cmdCheckUpdates(args: string[]): Promise<void> {
  const registry = loadRegistry(REGISTRY_PATH)
  const versions = loadVersions(VERSIONS_PATH)
  const asJson = args.includes('--json')

  const options = {
    tool: getArg(args, '--tool') ?? undefined,
    category: getArg(args, '--category') ?? undefined
  }

  if (asJson) {
    const result = await checkUpdates(registry, versions, options)
    saveVersions(VERSIONS_PATH, versions)
    console.log(JSON.stringify(result, null, 2))
    return
  }

  console.log('')
  log(BLUE, 'Checking for updates...')
  console.log('')

  const result = await checkUpdates(registry, versions, options, {
    // Checks run concurrently — one whole line per result, no partial writes
    onToolResult: (tool, res, hasUpdate, isNew) => {
      if (isNew) {
        console.log(`  ${tool.name}... ${BLUE}NEW${NC} — tracking from ${res.version}`)
      } else if (hasUpdate) {
        console.log(`  ${tool.name}... ${YELLOW}UPDATE${NC} ${res.version}`)
      } else if (res.version) {
        console.log(`  ${tool.name}... ${GREEN}OK${NC} ${res.version}`)
      } else {
        console.log(`  ${tool.name}... ${RED}ERROR${NC}${res.error ? ` ${res.error}` : ''}`)
      }
    }
  })

  saveVersions(VERSIONS_PATH, versions)

  console.log('')
  console.log('════════════════════════════════════════════════════')
  log(GREEN, `Up to date: ${result.upToDate.length}`)
  if (result.baselined.length > 0) {
    log(BLUE, `Newly tracked (baseline recorded, history not analyzed): ${result.baselined.length}`)
    for (const b of result.baselined) {
      console.log(`  • ${b.tool.name}: tracking from ${b.version}`)
    }
  }
  if (result.updates.length > 0) {
    log(YELLOW, `Updates available: ${result.updates.length}`)
    for (const u of result.updates) {
      console.log(`  • ${u.tool.name}: ${u.lastVersion} → ${u.currentVersion}`)
    }
  }
  if (result.errors.length > 0) {
    log(RED, `Errors: ${result.errors.length}`)
  }
  console.log('')
}

function cmdListTools(args: string[]): void {
  const registry = loadRegistry(REGISTRY_PATH)
  const versions = loadVersions(VERSIONS_PATH)

  const minStarsArg = getArg(args, '--min-stars')
  const options = {
    category: getArg(args, '--category') ?? undefined,
    hasUpdates: args.includes('--has-updates'),
    minStars: minStarsArg ? parseInt(minStarsArg, 10) : undefined
  }

  const result = listTools(registry, versions, options)

  console.log('')
  log(BLUE, `Tracked Tools (${result.totalTools})`)
  console.log('')

  for (const group of result.groups) {
    log(YELLOW, `${group.categoryName}:`)
    for (const item of group.tools) {
      const starsStr = item.tool.stars ? ` (${(item.tool.stars / 1000).toFixed(1)}k★)` : ''
      const updateMark = item.hasUpdate ? ` ${YELLOW}[UPDATE]${NC}` : ''
      const staleMark = item.isStale ? ` ${RED}[STALE]${NC}` : ''
      const lowStarMark = item.isLowStar ? ` ${YELLOW}[LOW-STAR]${NC}` : ''
      console.log(`  • ${item.tool.name}${starsStr}${updateMark}${staleMark}${lowStarMark}`)
    }
    console.log('')
  }

  if (result.staleCount > 0) {
    log(YELLOW, `${result.staleCount} tools have not been updated in 6+ months`)
  }
  if (result.lowStarCount > 0) {
    log(YELLOW, `${result.lowStarCount} tools have low star count (< ${options.minStars ?? 500})`)
  }
}

function cmdAddTool(args: string[]): void {
  const type = args[1] as ToolType
  const source = args[2]

  if (!type || !source || !TOOL_TYPES.includes(type)) {
    if (type && source) log(RED, `Unknown type '${type}'`)
    log(RED, 'Usage: bun radar.ts add <type> <source> [--category CAT]')
    log(BLUE, `Types: ${TOOL_TYPES.join(', ')}`)
    log(BLUE, 'Example: bun radar.ts add github anthropics/skills --category official')
    process.exit(1)
  }

  const registry = loadRegistry(REGISTRY_PATH)

  const result = addTool(registry, type, source, {
    category: getArg(args, '--category') ?? undefined,
    name: getArg(args, '--name') ?? undefined
  })

  if (result.success && result.tool) {
    saveRegistry(REGISTRY_PATH, registry)
    log(GREEN, `Added: ${result.tool.name} (${result.tool.id})`)
  } else {
    log(RED, result.error ?? 'Failed to add tool')
  }
}

function cmdRemoveTool(args: string[]): void {
  const toolId = args[1]

  if (!toolId) {
    log(RED, 'Usage: bun radar.ts remove <tool-id>')
    return
  }

  const registry = loadRegistry(REGISTRY_PATH)
  const result = removeTool(registry, toolId)

  if (result.success) {
    saveRegistry(REGISTRY_PATH, registry)

    // Clear version state too — a re-added tool must start from a fresh
    // baseline, not inherit stale history
    const versions = loadVersions(VERSIONS_PATH)
    if (versions.tools[toolId]) {
      delete versions.tools[toolId]
      saveVersions(VERSIONS_PATH, versions)
    }

    log(GREEN, `Removed: ${toolId}`)
  } else {
    log(RED, result.error ?? 'Failed to remove tool')
  }
}

function cmdShowTool(args: string[]): void {
  const toolId = args[1]

  if (!toolId) {
    log(RED, 'Usage: bun radar.ts show <tool-id>')
    return
  }

  const registry = loadRegistry(REGISTRY_PATH)
  const versions = loadVersions(VERSIONS_PATH)
  const details = getToolDetails(registry, versions, toolId)

  if (!details) {
    log(RED, `Tool not found: ${toolId}`)
    return
  }

  const { tool, versionData } = details

  console.log('')
  log(BLUE, tool.name)
  console.log(`  ID: ${tool.id}`)
  console.log(`  Type: ${tool.type}`)
  console.log(`  Category: ${tool.category}`)
  console.log(`  Source: ${typeof tool.source === 'string' ? tool.source : JSON.stringify(tool.source)}`)
  if (tool.url) console.log(`  URL: ${tool.url}`)
  if (tool.description) console.log(`  Description: ${tool.description}`)
  console.log('')
  console.log('  Version Info:')
  console.log(`    Current: ${versionData.currentVersion ?? 'unknown'}`)
  console.log(`    Last Analyzed: ${versionData.lastAnalyzedVersion ?? 'never'}`)
  console.log(`    Last Checked: ${versionData.lastChecked ?? 'never'}`)
  if (versionData.latestReleaseDate) {
    console.log(`    Release Date: ${versionData.latestReleaseDate.slice(0, 10)}`)
  }
  console.log('')
}

async function cmdChangelog(args: string[]): Promise<void> {
  const toolId = args[1]

  if (!toolId) {
    log(RED, 'Usage: bun radar.ts changelog <tool-id> [--json]')
    log(BLUE, 'Example: bun radar.ts changelog spec-kit')
    return
  }

  const registry = loadRegistry(REGISTRY_PATH)
  const versions = loadVersions(VERSIONS_PATH)
  const result = await getChangelog(registry, toolId, versions)

  if (!result) {
    log(RED, `Tool not found: ${toolId}`)
    return
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (result.error) {
    log(RED, result.error)
    return
  }

  console.log('')
  log(BLUE, `Changelog: ${result.tool.name}`)
  if (result.warning) log(YELLOW, `⚠ ${result.warning}`)
  console.log('')

  if (result.type === 'releases' && result.releases) {
    for (const release of result.releases) {
      log(YELLOW, `${release.tag}${release.date ? ` (${release.date})` : ''}`)
      if (release.name) console.log(`  ${release.name}`)
      for (const line of release.body) {
        console.log(`  ${line}`)
      }
      console.log('')
    }
  } else if (result.type === 'commits' && result.commits) {
    log(YELLOW, 'Recent Commits:')
    for (const commit of result.commits) {
      console.log(`  ${commit.sha} ${commit.date ?? ''} ${commit.message}`)
    }
    console.log('')
  }
}

function cmdMarkAnalyzed(args: string[]): void {
  const toolId = args[1]
  const version = args[2]

  if (!toolId) {
    log(RED, 'Usage: bun radar.ts mark-analyzed <tool-id> [version]')
    log(BLUE, 'Example: bun radar.ts mark-analyzed agent-os 3.0.0')
    log(BLUE, 'If version is omitted, uses currentVersion')
    return
  }

  const registry = loadRegistry(REGISTRY_PATH)
  const versions = loadVersions(VERSIONS_PATH)
  const result = markAnalyzed(registry, versions, toolId, version)

  if (result.success && result.tool) {
    saveVersions(VERSIONS_PATH, versions)
    log(GREEN, `Marked ${result.tool.name} as analyzed at v${result.newVersion}`)
    if (result.oldVersion) {
      console.log(`  Previous: ${result.oldVersion}`)
    }
  } else {
    log(RED, result.error ?? 'Failed to mark as analyzed')
  }
}

function cmdSuggest(): void {
  const selfId = loadConfig().selfId
  if (!selfId) {
    log(YELLOW, 'No selfId in .radar/config.json — set it to enable feature suggestions')
    return
  }
  const suggestions = suggestFeatures(COMPARISONS_DIR, selfId)

  if (suggestions.length === 0) {
    log(GREEN, `No missing features found! ${selfId} has all tracked features.`)
    return
  }

  console.log('')
  log(BLUE, 'Missing Features:')
  console.log('')

  // Group by category
  const byCategory: Record<string, typeof suggestions> = {}
  for (const s of suggestions) {
    const cat = s.category ?? 'uncategorized'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(s)
  }

  for (const [category, items] of Object.entries(byCategory)) {
    log(YELLOW, `${category}:`)
    for (const item of items) {
      console.log(`  • ${item.name}`)
      if (item.description) console.log(`    ${item.description}`)
      console.log(`    Available in: ${item.availableIn.join(', ')}`)
    }
    console.log('')
  }
}

async function cmdExtract(args: string[]): Promise<void> {
  const toolId = args[1]
  const update = args.includes('--update')

  if (!toolId) {
    log(RED, 'Usage: bun radar.ts extract <tool-id> [--update]')
    log(BLUE, 'Example: bun radar.ts extract spec-kit')
    log(BLUE, '  --update: Update registry with extracted features')
    return
  }

  const registry = loadRegistry(REGISTRY_PATH)
  const tool = registry.tools.find(
    t => t.id === toolId || t.name.toLowerCase().includes(toolId.toLowerCase())
  )

  if (!tool) {
    log(RED, `Tool not found: ${toolId}`)
    return
  }

  console.log('')
  log(BLUE, `Extracting features from: ${tool.name}`)
  console.log('')

  const result = await extractToolFeatures(tool)

  if (result.error) {
    log(YELLOW, `Warning: ${result.error}`)
    console.log('')
  }

  if (result.source === 'readme') {
    log(GREEN, `Extracted ${result.features.length} features from README:`)
    for (const feature of result.features) {
      console.log(`  • ${feature}`)
    }
    console.log('')

    // Compare with existing
    const existing = tool.features ?? []
    if (existing.length > 0) {
      const comparison = compareFeatures(existing, result.features)
      if (comparison.added.length > 0) {
        log(GREEN, `New features found (${comparison.added.length}):`)
        for (const f of comparison.added) {
          console.log(`  + ${f}`)
        }
      }
      if (comparison.removed.length > 0) {
        log(YELLOW, `Features not in README (${comparison.removed.length}):`)
        for (const f of comparison.removed) {
          console.log(`  - ${f}`)
        }
      }
      console.log('')
    }

    // Update registry if requested
    if (update) {
      tool.features = result.features
      saveRegistry(REGISTRY_PATH, registry)
      log(GREEN, 'Registry updated with extracted features')
    }
  } else {
    log(YELLOW, 'Using existing manual features:')
    for (const feature of result.features) {
      console.log(`  • ${feature}`)
    }
  }
  console.log('')
}

function cmdExport(args: string[]): void {
  const format = getArg(args, '--format') ?? 'json'
  const output = getArg(args, '--output')

  const registry = loadRegistry(REGISTRY_PATH)
  const versions = loadVersions(VERSIONS_PATH)

  // Build export data
  const exportData = {
    exportedAt: new Date().toISOString(),
    registry: {
      version: registry.version,
      categories: registry.categories,
      toolCount: registry.tools.length,
      tools: registry.tools.map(tool => {
        const vd = versions.tools[tool.id] ?? {}
        return {
          id: tool.id,
          name: tool.name,
          category: tool.category,
          type: tool.type,
          source: tool.source,
          url: tool.url,
          currentVersion: vd.currentVersion ?? null,
          lastAnalyzedVersion: vd.lastAnalyzedVersion ?? null,
          latestReleaseDate: vd.latestReleaseDate ?? null,
          lastChecked: vd.lastChecked ?? null,
          historyCount: vd.history?.length ?? 0,
          hasUpdate: vd.currentVersion && vd.lastAnalyzedVersion && vd.currentVersion !== vd.lastAnalyzedVersion,
          features: tool.features ?? []
        }
      })
    },
    summary: {
      totalTools: registry.tools.length,
      byCategory: Object.entries(
        registry.tools.reduce((acc, t) => {
          acc[t.category] = (acc[t.category] ?? 0) + 1
          return acc
        }, {} as Record<string, number>)
      ),
      byType: Object.entries(
        registry.tools.reduce((acc, t) => {
          acc[t.type] = (acc[t.type] ?? 0) + 1
          return acc
        }, {} as Record<string, number>)
      ),
      withUpdates: registry.tools.filter(t => {
        const vd = versions.tools[t.id]
        return vd?.currentVersion && vd?.lastAnalyzedVersion && vd.currentVersion !== vd.lastAnalyzedVersion
      }).length
    }
  }

  const jsonOutput = JSON.stringify(exportData, null, 2)

  if (output) {
    writeFileSync(output, jsonOutput)
    log(GREEN, `Exported to: ${output}`)
  } else {
    console.log(jsonOutput)
  }
}

function cmdHistory(args: string[]): void {
  const toolId = args[1]

  if (!toolId) {
    log(RED, 'Usage: bun radar.ts history <tool-id>')
    log(BLUE, 'Example: bun radar.ts history agent-os')
    return
  }

  const registry = loadRegistry(REGISTRY_PATH)
  const versions = loadVersions(VERSIONS_PATH)
  const details = getToolDetails(registry, versions, toolId)

  if (!details) {
    log(RED, `Tool not found: ${toolId}`)
    return
  }

  const { tool, versionData } = details
  const history = getVersionHistory(versionData)
  const breaking = getBreakingChanges(versionData)

  console.log('')
  log(BLUE, `Version History: ${tool.name}`)
  console.log('')

  if (history.length === 0) {
    log(YELLOW, 'No version history yet. Run "check" to start tracking versions.')
    console.log('')
    return
  }

  // Show summary
  console.log(`  Total versions tracked: ${history.length}`)
  console.log(`  Breaking changes: ${breaking.length}`)
  console.log('')

  // Show history (newest first, limited to 10)
  log(YELLOW, 'Recent versions:')
  for (const entry of history.slice(0, 10)) {
    const typeColor = entry.type === 'major' ? RED : entry.type === 'minor' ? YELLOW : GREEN
    const breakingMark = entry.breaking ? ` ${RED}[BREAKING]${NC}` : ''
    console.log(`  ${entry.version} (${entry.date?.slice(0, 10) ?? 'unknown'}) ${typeColor}${entry.type}${NC}${breakingMark}`)
  }

  if (history.length > 10) {
    console.log(`  ... and ${history.length - 10} more`)
  }

  console.log('')
}

async function cmdRateLimit(): Promise<void> {
  const rateLimit = await getGitHubRateLimit()

  if (!rateLimit) {
    log(RED, 'Failed to get rate limit info')
    return
  }

  console.log('')
  log(BLUE, 'GitHub API Rate Limit')
  console.log('')
  console.log(`  Authenticated: ${rateLimit.authenticated ? GREEN + 'Yes' + NC : YELLOW + 'No' + NC}`)
  console.log(`  Limit: ${rateLimit.limit} requests/hour`)
  console.log(`  Remaining: ${rateLimit.remaining}`)
  console.log(`  Reset: ${rateLimit.reset.toLocaleTimeString()}`)
  console.log('')

  if (!rateLimit.authenticated) {
    log(YELLOW, 'Tip: Set the GITHUB_TOKEN env var to increase limit to 5000/hour')
    console.log(`     You can use $GITHUB_TOKEN or \${GITHUB_TOKEN} to reference env vars`)
    console.log('')
  }
}

async function cmdDiscover(args: string[]): Promise<void> {
  const registry = loadRegistry(REGISTRY_PATH)

  const minStarsArg = getArg(args, '--min-stars')
  const minStars = minStarsArg ? parseInt(minStarsArg, 10) : 500
  const sourceArg = getArg(args, '--source')
  const validSources = ['github', 'awesome', 'all'] as const

  if (sourceArg && !validSources.includes(sourceArg as typeof validSources[number])) {
    log(RED, `Invalid source: ${sourceArg}`)
    log(BLUE, 'Valid sources: github, awesome, all')
    return
  }

  const source = (sourceArg as 'github' | 'awesome' | 'all') ?? 'all'

  console.log('')
  log(BLUE, `Tool Discovery (min ${minStars}★)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  const results = await discoverTools(
    registry,
    { minStars, source },
    {
      onQueryStart: (query) => process.stdout.write(`  Searching: ${query}... `),
      onQueryResult: (_query, count) => console.log(`${count} results`),
      onAwesomeListStart: (repo) => process.stdout.write(`  Parsing: ${repo}... `),
      onAwesomeListResult: (_repo, count) => console.log(`${count} new tools`),
      onStarCheck: (repo, stars) => {
        if (stars >= minStars) {
          process.stdout.write(`    ${GREEN}★${NC} `)
        }
      }
    }
  )

  console.log('')

  if (results.length === 0) {
    log(GREEN, 'No new tools found. Registry is comprehensive!')
    console.log('')
    return
  }

  // Group by source
  const fromGitHub = results.filter(r => r.source === 'github-search')
  const fromAwesome = results.filter(r => r.source === 'awesome-list')

  if (fromGitHub.length > 0) {
    log(YELLOW, 'From GitHub Search:')
    for (const r of fromGitHub) {
      const starsStr = r.stars >= 1000
        ? `${(r.stars / 1000).toFixed(1)}k`
        : String(r.stars)
      console.log(`  ★ ${starsStr.padStart(6)}  ${r.name} (${r.repo})`)
      if (r.description) {
        console.log(`           "${r.description.slice(0, 70)}${r.description.length > 70 ? '...' : ''}"`)
      }
    }
    console.log('')
  }

  if (fromAwesome.length > 0) {
    log(YELLOW, 'From Awesome Lists:')
    for (const r of fromAwesome) {
      const starsStr = r.stars >= 1000
        ? `${(r.stars / 1000).toFixed(1)}k`
        : String(r.stars)
      console.log(`  ★ ${starsStr.padStart(6)}  ${r.name} (${r.repo})`)
      if (r.awesomeListSource) {
        console.log(`           Source: ${r.awesomeListSource}`)
      }
    }
    console.log('')
  }

  console.log('════════════════════════════════════════════════════')
  log(GREEN, `Found ${results.length} new tools (not in registry).`)
  console.log(`To add: bun radar.ts add github owner/repo`)
  console.log('')
}

function showHelp(): void {
  console.log('')
  log(BLUE, 'radar — ecosystem tracking for the current repo')
  console.log('')
  console.log('Watches the tools this repo cares about (competitors, upstream')
  console.log('projects, dependencies), detects new releases, and hands their')
  console.log('changelogs to your coding agent for analysis grounded in THIS repo.')
  console.log('')
  console.log('How it works:')
  console.log('  1. init            .radar/ created; your agent proposes what to track')
  console.log('  2. check           fetches versions; first sighting = NEW baseline,')
  console.log('                     later runs report UPDATE against last analysis')
  console.log('  3. changelog       available releases/commits for the unanalyzed')
  console.log('                     range — warns when the range may be incomplete')
  console.log('  4. (agent reads them, compares against this repo, recommends)')
  console.log('  5. mark-analyzed   moves the anchor so next run only shows new items')
  console.log('')
  console.log('Usage: bun radar.ts <command>')
  console.log('  init [--workflow]                     Create .radar/ (+ weekly CI check that opens issues)')
  console.log('  check [--tool X] [--category X] [--json]')
  console.log('                                        Fetch latest versions, diff against state')
  console.log('  list [--category X] [--has-updates] [--min-stars N]')
  console.log('                                        Tracked tools by category')
  console.log('  add <type> <source> [--category X] [--name X]')
  console.log('                                        Track a new tool')
  console.log('  remove <tool-id>                      Untrack (clears its state too)')
  console.log('  show <tool-id>                        Tool details')
  console.log('  changelog <tool-id> [--json]          Releases/commits since last analysis; warns if incomplete')
  console.log('  mark-analyzed <tool-id> [version]     Record analysis done up to a version')
  console.log('  suggest                               Features others have, this repo lacks')
  console.log('  history <tool-id>                     Version history with breaking flags')
  console.log('  discover [--min-stars 500] [--source github|awesome|all]')
  console.log('                                        Find new candidate tools')
  console.log('  extract <tool-id> [--update]          Pull features from a README')
  console.log('  export [--output file.json]           Dump data as JSON')
  console.log('  rate-limit                            GitHub API quota status')
  console.log('')
  console.log(`Types: ${TOOL_TYPES.join(', ')}`)
  console.log('')
  console.log('Data lives in ./.radar/ (git-tracked JSON). Set the GITHUB_TOKEN')
  console.log('env var to lift the anonymous 60 req/h GitHub limit.')
  console.log('')
}

// ─────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────

function cmdInit(args: string[]): void {
  // Data initialization — only when missing, never touches existing data
  if (existsSync(REGISTRY_PATH)) {
    log(YELLOW, `.radar/ already initialized at ${RADAR_DIR} — data untouched`)
  } else {
    mkdirSync(RADAR_DIR, { recursive: true })
    copyFileSync(join(TEMPLATES_DIR, 'registry.seed.json'), REGISTRY_PATH)
    writeFileSync(
      VERSIONS_PATH,
      JSON.stringify({ lastChecked: null, tools: {} }, null, 2) + '\n'
    )
    writeFileSync(CONFIG_PATH, JSON.stringify({ selfId: null }, null, 2) + '\n')

    log(GREEN, `Initialized ${RADAR_DIR}`)
    console.log('  registry.json  — tracked tools (seeded, edit freely)')
    console.log('  versions.json  — check state')
    console.log('  config.json    — set selfId to this project\'s id for `suggest`')
  }

  // Workflow installation — independent of data state and idempotent, so
  // `init --workflow` also works later and refreshes the vendored CLI
  if (args.includes('--workflow')) {
    const wfDir = join(process.cwd(), '.github', 'workflows')
    const wfPath = join(wfDir, 'radar.yml')
    if (existsSync(wfPath)) {
      log(YELLOW, `${wfPath} exists — not overwritten (delete it to regenerate)`)
    } else {
      mkdirSync(wfDir, { recursive: true })
      copyFileSync(join(TEMPLATES_DIR, 'radar.yml'), wfPath)
      log(GREEN, `Installed weekly check workflow: ${wfPath}`)
    }

    // Vendor the CLI so CI never fetches remote code (supply-chain: the
    // exact scripts you review here are the ones the workflow runs).
    // Stage + swap so a refresh never leaves stale files from old versions.
    const vendorDir = join(process.cwd(), '.github', 'radar')
    const staging = `${vendorDir}.staging`
    rmSync(staging, { recursive: true, force: true })
    cpSync(__dirname, staging, {
      recursive: true,
      filter: (src) => !src.endsWith('.test.ts')
    })
    rmSync(vendorDir, { recursive: true, force: true })
    renameSync(staging, vendorDir)
    log(GREEN, `Vendored radar CLI: ${vendorDir}`)
    console.log('  CI runs this copy — re-run `init --workflow` after skill updates.')
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Load .env file if exists
  loadEnvFile()

  // Initialize GitHub token from config
  initGitHubToken()

  const args = process.argv.slice(2)
  const command = args[0]

  // Commands that don't touch .radar/ data
  const NO_DATA_COMMANDS = ['init', 'rate-limit', 'ratelimit', 'help', '--help', undefined]
  if (!NO_DATA_COMMANDS.includes(command) && !existsSync(REGISTRY_PATH)) {
    log(RED, `No .radar/ found in ${process.cwd()}`)
    log(BLUE, 'Run `init` first (from the repo root you want to track).')
    process.exit(1)
  }

  switch (command) {
    case 'init':
      cmdInit(args)
      break

    case 'check':
    case 'update':
      await cmdCheckUpdates(args)
      break

    case 'list':
      cmdListTools(args)
      break

    case 'add':
      cmdAddTool(args)
      break

    case 'remove':
      cmdRemoveTool(args)
      break

    case 'show':
      cmdShowTool(args)
      break

    case 'changelog':
      await cmdChangelog(args)
      break

    case 'mark-analyzed':
      cmdMarkAnalyzed(args)
      break

    case 'suggest':
      cmdSuggest()
      break

    case 'rate-limit':
    case 'ratelimit':
      await cmdRateLimit()
      break

    case 'history':
      cmdHistory(args)
      break

    case 'export':
      cmdExport(args)
      break

    case 'extract':
      await cmdExtract(args)
      break

    case 'discover':
      await cmdDiscover(args)
      break

    default:
      showHelp()
      break
  }
}

main().catch(err => {
  log(RED, `Error: ${err.message}`)
  process.exit(1)
})
