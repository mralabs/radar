/**
 * PyPI API Client
 *
 * Fetch package versions from Python Package Index.
 */

import { fetchJson } from './client'
import type { VersionResult, PyPIResponse } from '../types'

const PYPI_API = 'https://pypi.org/pypi'

/**
 * Get latest version from PyPI
 */
export async function getPyPIVersion(packageName: string): Promise<VersionResult> {
  try {
    const data = await fetchJson<PyPIResponse>(`${PYPI_API}/${packageName}/json`)

    if (data?.info?.version) {
      const version = data.info.version

      // Get upload time from releases
      let publishedAt: string | null = null
      const releases = data.releases?.[version]
      if (releases && releases.length > 0) {
        publishedAt = releases[0].upload_time ?? null
      }

      return { version, publishedAt, error: null }
    }

    return { version: null, publishedAt: null, error: 'no version in response' }
  } catch (err) {
    return {
      version: null,
      publishedAt: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

/**
 * Resolve the GitHub repo behind a PyPI package (project_urls / home_page)
 */
export async function getPyPIRepoUrl(packageName: string): Promise<string | null> {
  try {
    const data = await fetchJson<{
      info?: { project_urls?: Record<string, string> | null; home_page?: string | null }
    }>(`${PYPI_API}/${packageName}/json`)

    const candidates = [
      ...Object.values(data?.info?.project_urls ?? {}),
      data?.info?.home_page ?? ''
    ]
    return candidates.find(u => u && u.includes('github.com')) ?? null
  } catch {
    return null
  }
}
