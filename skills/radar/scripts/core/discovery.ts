/**
 * Tool Discovery
 *
 * Discover new tools via GitHub Search API and awesome-list parsing.
 * Filters against existing registry to only suggest new tools.
 */

import { fetchJson } from './api/client'
import { GITHUB_API, getAuthOptions } from './api/github'
import type { Registry, DiscoveryResult } from './types'
import { MIN_STARS_THRESHOLD } from './reports'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface GitHubSearchResponse {
  total_count: number
  items: GitHubSearchItem[]
}

interface GitHubSearchItem {
  full_name: string
  name: string
  html_url: string
  description: string | null
  stargazers_count: number
  created_at: string
  pushed_at: string
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** Search queries for Claude Code ecosystem tools */
const SEARCH_QUERIES = [
  'claude+code+skill stars:>{minStars}',
  'claude+code+plugin stars:>{minStars}',
  'claude+code+orchestration stars:>{minStars}',
  'claude+code+mcp stars:>{minStars}',
  'ai+coding+cli stars:>{minStars}'
]

/** Known awesome-lists to parse */
const AWESOME_LISTS = [
  'hesreallyhim/awesome-claude-code',
  'ComposioHQ/awesome-claude-skills',
  'VoltAgent/awesome-agent-skills'
]

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Get set of tracked repo identifiers from registry
 */
function getTrackedRepos(registry: Registry): Set<string> {
  const tracked = new Set<string>()

  for (const tool of registry.tools) {
    if (typeof tool.source === 'string') {
      tracked.add(tool.source.toLowerCase())
    } else if (tool.source?.repo) {
      tracked.add(tool.source.repo.toLowerCase())
    } else if (tool.source?.package) {
      tracked.add(tool.source.package.toLowerCase())
    }
  }

  return tracked
}

/**
 * Extract GitHub repo links from markdown content
 * Matches patterns like: [name](https://github.com/owner/repo)
 */
function extractGitHubLinks(markdown: string): string[] {
  const regex = /\[([^\]]*)\]\(https?:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\/?[^)]*\)/g
  const repos: string[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(markdown)) !== null) {
    repos.push(match[2])
  }

  // Deduplicate
  return [...new Set(repos)]
}

// ─────────────────────────────────────────────────────────────
// GitHub Search
// ─────────────────────────────────────────────────────────────

export interface DiscoveryCallbacks {
  onQueryStart?: (query: string) => void
  onQueryResult?: (query: string, count: number) => void
  onAwesomeListStart?: (repo: string) => void
  onAwesomeListResult?: (repo: string, count: number) => void
  onStarCheck?: (repo: string, stars: number) => void
}

/**
 * Discover tools from GitHub Search API
 */
export async function discoverFromGitHub(
  registry: Registry,
  minStars: number = MIN_STARS_THRESHOLD,
  callbacks?: DiscoveryCallbacks
): Promise<DiscoveryResult[]> {
  const tracked = getTrackedRepos(registry)
  const results: DiscoveryResult[] = []
  const seen = new Set<string>()
  const options = getAuthOptions()

  for (const queryTemplate of SEARCH_QUERIES) {
    const query = queryTemplate.replace('{minStars}', String(minStars))
    callbacks?.onQueryStart?.(query)

    try {
      const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=30`
      const response = await fetchJson<GitHubSearchResponse>(url, options)

      if (!response?.items) {
        callbacks?.onQueryResult?.(query, 0)
        continue
      }

      callbacks?.onQueryResult?.(query, response.items.length)

      for (const item of response.items) {
        const repoKey = item.full_name.toLowerCase()

        // Skip already tracked or already seen in this session
        if (tracked.has(repoKey) || seen.has(repoKey)) continue
        seen.add(repoKey)

        // Skip below min stars
        if (item.stargazers_count < minStars) continue

        results.push({
          source: 'github-search',
          name: item.name,
          repo: item.full_name,
          url: item.html_url,
          stars: item.stargazers_count,
          description: item.description ?? '',
          alreadyTracked: false
        })
      }
    } catch {
      // Skip failed queries (rate limit, network error)
      callbacks?.onQueryResult?.(query, 0)
    }
  }

  // Sort by stars descending
  results.sort((a, b) => b.stars - a.stars)

  return results
}

// ─────────────────────────────────────────────────────────────
// Awesome-list Parsing
// ─────────────────────────────────────────────────────────────

/** Timeout for README fetches (15 seconds) */
const README_TIMEOUT = 15000

/**
 * Fetch raw README content from a GitHub repo
 */
async function fetchReadme(repo: string): Promise<string | null> {
  const options = getAuthOptions()

  for (const branch of ['main', 'master']) {
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/README.md`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), README_TIMEOUT)

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'radar/1.0',
          ...(options.headers ?? {})
        },
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        return await response.text()
      }
    } catch {
      clearTimeout(timeoutId)
      // Try next branch
    }
  }

  return null
}

/**
 * Get star count for a GitHub repo
 */
async function getRepoStars(repo: string): Promise<number | null> {
  const options = getAuthOptions()

  try {
    const data = await fetchJson<{ stargazers_count: number }>(
      `${GITHUB_API}/repos/${repo}`,
      options
    )
    return data?.stargazers_count ?? null
  } catch {
    return null
  }
}

/** Max star-check API calls per awesome-list to avoid rate limiting */
const MAX_STAR_CHECKS_PER_LIST = 50

/**
 * Discover tools from awesome-lists
 *
 * Limits star-check API calls per list to avoid hitting rate limits.
 * Unauthenticated: 60 req/hr, Authenticated: 5000 req/hr.
 */
export async function discoverFromAwesomeLists(
  registry: Registry,
  minStars: number = MIN_STARS_THRESHOLD,
  callbacks?: DiscoveryCallbacks
): Promise<DiscoveryResult[]> {
  const tracked = getTrackedRepos(registry)
  const results: DiscoveryResult[] = []
  const seen = new Set<string>()

  for (const awesomeRepo of AWESOME_LISTS) {
    callbacks?.onAwesomeListStart?.(awesomeRepo)

    try {
      const readme = await fetchReadme(awesomeRepo)
      if (!readme) {
        callbacks?.onAwesomeListResult?.(awesomeRepo, 0)
        continue
      }

      const repos = extractGitHubLinks(readme)
      let foundCount = 0
      let starChecks = 0

      for (const repo of repos) {
        // Stop checking stars if we've hit the per-list limit
        if (starChecks >= MAX_STAR_CHECKS_PER_LIST) break

        const repoKey = repo.toLowerCase()

        // Skip self-references (the awesome list itself)
        if (repoKey === awesomeRepo.toLowerCase()) continue

        // Skip already tracked or already seen
        if (tracked.has(repoKey) || seen.has(repoKey)) continue
        seen.add(repoKey)

        // Check star count (counts toward rate limit)
        starChecks++
        const stars = await getRepoStars(repo)
        callbacks?.onStarCheck?.(repo, stars ?? 0)

        if (stars === null || stars < minStars) continue

        foundCount++
        results.push({
          source: 'awesome-list',
          name: repo.split('/')[1],
          repo,
          url: `https://github.com/${repo}`,
          stars,
          description: '',
          alreadyTracked: false,
          awesomeListSource: awesomeRepo.split('/')[1]
        })
      }

      callbacks?.onAwesomeListResult?.(awesomeRepo, foundCount)
    } catch {
      callbacks?.onAwesomeListResult?.(awesomeRepo, 0)
    }
  }

  // Sort by stars descending
  results.sort((a, b) => b.stars - a.stars)

  return results
}

// ─────────────────────────────────────────────────────────────
// Combined Discovery
// ─────────────────────────────────────────────────────────────

export interface DiscoveryOptions {
  minStars?: number
  source?: 'github' | 'awesome' | 'all'
}

/**
 * Discover new tools from all sources
 */
export async function discoverTools(
  registry: Registry,
  options: DiscoveryOptions = {},
  callbacks?: DiscoveryCallbacks
): Promise<DiscoveryResult[]> {
  const { minStars = MIN_STARS_THRESHOLD, source = 'all' } = options

  const githubResults = (source === 'all' || source === 'github')
    ? await discoverFromGitHub(registry, minStars, callbacks)
    : []

  const awesomeResults = (source === 'all' || source === 'awesome')
    ? await discoverFromAwesomeLists(registry, minStars, callbacks)
    : []

  // Merge and deduplicate (prefer github-search results as they have descriptions)
  const merged = new Map<string, DiscoveryResult>()

  for (const result of githubResults) {
    merged.set(result.repo.toLowerCase(), result)
  }

  for (const result of awesomeResults) {
    const key = result.repo.toLowerCase()
    if (!merged.has(key)) {
      merged.set(key, result)
    }
  }

  // Sort by stars descending
  const all = [...merged.values()]
  all.sort((a, b) => b.stars - a.stars)

  return all
}
