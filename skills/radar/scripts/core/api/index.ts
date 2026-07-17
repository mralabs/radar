/**
 * Research API Clients
 *
 * Fetch-based clients for GitHub, PyPI, and NPM.
 */

export { fetchJson } from './client.ts'
export type { FetchOptions } from './client.ts'

export {
  GITHUB_API,
  getAuthOptions,
  getGitHubVersion,
  getGitHubReleases,
  getGitHubReleasesSince,
  getGitHubCommits,
  getGitHubCommitsSince,
  getGitHubFileText,
  getLatestTagSha,
  extractGitHubRepo,
  getGitHubRateLimit,
  setGitHubToken,
  getGitHubToken
} from './github.ts'
export { getPyPIVersion, getPyPIRepoUrl } from './pypi.ts'
export { getNPMVersion, getNPMRepoUrl } from './npm.ts'
export { getNuGetVersion, getNuGetRepoUrl } from './nuget.ts'
