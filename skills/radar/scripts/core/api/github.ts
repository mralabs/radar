/**
 * GitHub API Client
 *
 * Fetch releases, tags, and commits from GitHub.
 */

import { fetchJson, type FetchOptions } from './client'
import type { VersionResult, GitHubRelease, GitHubTag, GitHubCommit } from '../types'

export const GITHUB_API = 'https://api.github.com'

/** Shared GitHub token (set via setGitHubToken) */
let githubToken: string | null = null

/**
 * Set the GitHub API token for authenticated requests
 * Increases rate limit from 60 to 5000 requests/hour
 */
export function setGitHubToken(token: string | null): void {
  githubToken = token
}

/**
 * Get the current GitHub token
 */
export function getGitHubToken(): string | null {
  return githubToken
}

/**
 * Get fetch options with authorization header if token is set
 */
export function getAuthOptions(): FetchOptions {
  if (!githubToken) return {}
  return {
    headers: {
      Authorization: `Bearer ${githubToken}`
    }
  }
}

/**
 * Get latest version from GitHub releases or tags
 */
export async function getGitHubVersion(repo: string): Promise<VersionResult> {
  const options = getAuthOptions()

  try {
    // Try releases first
    const release = await fetchJson<GitHubRelease>(
      `${GITHUB_API}/repos/${repo}/releases/latest`,
      options
    )

    if (release?.tag_name) {
      return {
        version: release.tag_name.replace(/^v/, ''),
        publishedAt: release.published_at ?? null,
        error: null
      }
    }

    // Fall back to tags (no date available)
    const tags = await fetchJson<GitHubTag[]>(
      `${GITHUB_API}/repos/${repo}/tags`,
      options
    )

    if (tags && tags.length > 0) {
      return {
        version: tags[0].name.replace(/^v/, ''),
        publishedAt: null,
        error: null
      }
    }

    // Fall back to commits (for repos without releases/tags)
    const commits = await fetchJson<GitHubCommit[]>(
      `${GITHUB_API}/repos/${repo}/commits?per_page=1`,
      options
    )

    if (commits && commits.length > 0) {
      const commit = commits[0]
      const shortSha = commit.sha.slice(0, 7)
      const commitDate = commit.commit?.author?.date ?? null

      return {
        version: `commit-${shortSha}`,
        publishedAt: commitDate,
        error: null
      }
    }

    return { version: null, publishedAt: null, error: 'no releases, tags, or commits' }
  } catch (err) {
    return {
      version: null,
      publishedAt: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

/**
 * Get recent releases from GitHub
 */
export async function getGitHubReleases(repo: string, count = 5): Promise<GitHubRelease[]> {
  const releases = await fetchJson<GitHubRelease[]>(
    `${GITHUB_API}/repos/${repo}/releases?per_page=${count}`,
    getAuthOptions()
  )

  return releases ?? []
}

/**
 * Get recent commits from GitHub
 */
export async function getGitHubCommits(repo: string, count = 10): Promise<GitHubCommit[]> {
  const commits = await fetchJson<GitHubCommit[]>(
    `${GITHUB_API}/repos/${repo}/commits?per_page=${count}`,
    getAuthOptions()
  )

  return commits ?? []
}

/**
 * Get GitHub rate limit status
 */
export async function getGitHubRateLimit(): Promise<{
  limit: number
  remaining: number
  reset: Date
  authenticated: boolean
} | null> {
  try {
    const response = await fetchJson<{
      rate: {
        limit: number
        remaining: number
        reset: number
      }
    }>(`${GITHUB_API}/rate_limit`, getAuthOptions())

    if (!response?.rate) return null

    return {
      limit: response.rate.limit,
      remaining: response.rate.remaining,
      reset: new Date(response.rate.reset * 1000),
      authenticated: !!githubToken
    }
  } catch {
    return null
  }
}

/**
 * Extract "owner/repo" from any GitHub URL form
 * (git+https://github.com/o/r.git, git://, https://, ssh)
 */
export function extractGitHubRepo(url: string | null | undefined): string | null {
  if (!url) return null
  const match = url.match(/github\.com[/:]([^/\s]+\/[^/\s#?]+?)(?:\.git)?(?:[/#?].*)?$/)
  return match ? match[1] : null
}

/**
 * Does a release tag refer to this version?
 *
 * Default: exact (v)1.2.3 only. Monorepo styles (pkg@1.2.3, pkg/v1.2.3,
 * pkg-v1.2.3) match ONLY when packageName is given and the tag belongs to
 * that package — a suffix-only match would stop at another package's tag
 * and silently truncate the range with anchorFound=true.
 */
export function tagMatchesVersion(
  tag: string,
  version: string,
  packageName: string | null = null
): boolean {
  const v = version.replace(/^v/, '')
  if (tag.replace(/^v/, '') === v) return true

  if (!packageName) return false
  return ['@', '@v', '/', '/v', '-v'].some(sep => tag === `${packageName}${sep}${v}`)
}

export interface ReleasesSinceResult {
  releases: GitHubRelease[]
  /** false = anchor version not found among tags; range may be incomplete */
  anchorFound: boolean
  /** true = stopped at the page cap with more releases possibly remaining */
  truncated: boolean
}

/**
 * Get all releases newer than sinceVersion (exclusive), paginating so the
 * analysis range never silently loses a release. sinceVersion null → first
 * page only (baseline case). Callers must surface anchorFound/truncated —
 * an unfound anchor means the result is NOT guaranteed complete.
 */
export async function getGitHubReleasesSince(
  repo: string,
  sinceVersion: string | null,
  maxPages = 5,
  packageName: string | null = null
): Promise<ReleasesSinceResult> {
  const collected: GitHubRelease[] = []

  for (let page = 1; page <= maxPages; page++) {
    const releases = await fetchJson<GitHubRelease[]>(
      `${GITHUB_API}/repos/${repo}/releases?per_page=100&page=${page}`,
      getAuthOptions()
    )
    if (!releases || releases.length === 0) {
      return { releases: collected, anchorFound: !sinceVersion, truncated: false }
    }

    for (const release of releases) {
      if (sinceVersion && tagMatchesVersion(release.tag_name, sinceVersion, packageName)) {
        return { releases: collected, anchorFound: true, truncated: false }
      }
      collected.push(release)
    }

    if (!sinceVersion) {
      return { releases: collected, anchorFound: true, truncated: releases.length === 100 }
    }
    if (releases.length < 100) {
      return { releases: collected, anchorFound: false, truncated: false }
    }
  }

  return { releases: collected, anchorFound: false, truncated: true }
}

export interface CommitsSinceResult {
  commits: GitHubCommit[]
  /** false = anchor ref not resolvable; caller should fall back + warn */
  anchorFound: boolean
  /** true = radar's 300-commit fetch limit reached; oldest commits missing */
  truncated: boolean
  totalCommits: number
}

/**
 * All commits after sinceRef (tag or SHA) up to HEAD via the compare API —
 * the tag-only-repo counterpart of getGitHubReleasesSince. Tries the ref
 * as-is and with a 'v' prefix (versions are stored unprefixed). Radar
 * fetches at most 300 commits (3 pages x 100); beyond that truncated=true.
 */
export async function getGitHubCommitsSince(
  repo: string,
  sinceRef: string
): Promise<CommitsSinceResult> {
  // versions store commit anchors as "commit-<shortSha>" (see getGitHubVersion)
  const base = sinceRef.replace(/^commit-/, '')
  const candidates = base.startsWith('v') ? [base, base.slice(1)] : [base, `v${base}`]

  for (const ref of candidates) {
    const collected: GitHubCommit[] = []
    let totalCommits = 0
    let resolved = true

    for (let page = 1; page <= 3; page++) {
      const cmp = await fetchJson<{ total_commits: number; commits: GitHubCommit[] }>(
        `${GITHUB_API}/repos/${repo}/compare/${encodeURIComponent(ref)}...HEAD?per_page=100&page=${page}`,
        getAuthOptions()
      )
      if (cmp === null) {
        resolved = false // 404: ref doesn't exist under this spelling
        break
      }

      totalCommits = cmp.total_commits
      collected.push(...cmp.commits)
      if (collected.length >= totalCommits || cmp.commits.length === 0) break
    }

    if (resolved) {
      // compare returns oldest→newest; newest-first matches release output
      collected.reverse()
      return {
        commits: collected,
        anchorFound: true,
        truncated: collected.length < totalCommits,
        totalCommits
      }
    }
  }

  return { commits: [], anchorFound: false, truncated: false, totalCommits: 0 }
}
