/**
 * Research API Clients
 *
 * Fetch-based clients for GitHub, PyPI, and NPM.
 */

export { fetchJson } from './client'
export type { FetchOptions } from './client'

export {
  GITHUB_API,
  getAuthOptions,
  getGitHubVersion,
  getGitHubReleases,
  getGitHubReleasesSince,
  getGitHubCommits,
  getGitHubCommitsSince,
  extractGitHubRepo,
  getGitHubRateLimit,
  setGitHubToken,
  getGitHubToken
} from './github'
export { getPyPIVersion, getPyPIRepoUrl } from './pypi'
export { getNPMVersion, getNPMRepoUrl } from './npm'
export { getNuGetVersion } from './nuget'
