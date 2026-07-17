/**
 * NPM Registry API Client
 *
 * Fetch package versions from NPM registry.
 */

import { fetchJson } from './client.ts'
import type { VersionResult, NPMResponse } from '../types.ts'

const NPM_REGISTRY = 'https://registry.npmjs.org'

/**
 * Get latest version from NPM
 */
export async function getNPMVersion(packageName: string): Promise<VersionResult> {
  try {
    const data = await fetchJson<NPMResponse>(`${NPM_REGISTRY}/${packageName}`)

    if (data?.['dist-tags']?.latest) {
      const version = data['dist-tags'].latest

      // Get publish time from time object
      const publishedAt = data.time?.[version] ?? null

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
 * Resolve the GitHub repo behind an npm package (repository.url metadata)
 */
export async function getNPMRepoUrl(packageName: string): Promise<string | null> {
  try {
    const data = await fetchJson<{ repository?: { url?: string } | string }>(
      `${NPM_REGISTRY}/${packageName}`
    )
    const repo = data?.repository
    return typeof repo === 'string' ? repo : repo?.url ?? null
  } catch {
    return null
  }
}
