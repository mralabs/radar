/**
 * NuGet API Client
 *
 * Fetch package versions from NuGet (for .NET packages like Semantic Kernel).
 */

import { fetchJson } from './client.ts'
import type { VersionResult, NuGetResponse } from '../types.ts'

const NUGET_API = 'https://api.nuget.org/v3-flatcontainer'

/**
 * Get latest version from NuGet
 *
 * NuGet API structure:
 * - GET /v3-flatcontainer/{package-id}/index.json → { versions: ["1.0.0", "1.1.0", ...] }
 */
export async function getNuGetVersion(packageId: string): Promise<VersionResult> {
  // NuGet package IDs are case-insensitive, API requires lowercase
  const normalizedId = packageId.toLowerCase()

  try {
    const url = `${NUGET_API}/${normalizedId}/index.json`
    const response = await fetchJson<NuGetResponse>(url)

    if (!response?.versions || response.versions.length === 0) {
      return { version: null, publishedAt: null, error: 'no versions found' }
    }

    // Versions are sorted oldest to newest, get the last one
    const versions = response.versions

    // Filter out prerelease versions (contain - like "1.0.0-preview1")
    const stableVersions = versions.filter(v => !v.includes('-'))

    // Use latest stable if available, otherwise latest overall
    const latestVersion = stableVersions.length > 0
      ? stableVersions[stableVersions.length - 1]
      : versions[versions.length - 1]

    // NuGet index.json doesn't include publish dates
    // We could fetch the .nuspec for each version but that's expensive
    return {
      version: latestVersion,
      publishedAt: null,
      error: null
    }
  } catch (err) {
    return {
      version: null,
      publishedAt: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}
