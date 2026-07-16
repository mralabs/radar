/**
 * Version History Module
 *
 * Track version changes over time with semantic versioning analysis.
 */

import type { VersionData, VersionHistoryEntry, VersionChangeType } from './types'

// ─────────────────────────────────────────────────────────────
// SemVer Parsing
// ─────────────────────────────────────────────────────────────

interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string | null
  raw: string
}

/**
 * Parse a version string into components
 *
 * Supports formats: 1.2.3, v1.2.3, 1.2.3-beta.1
 */
export function parseVersion(version: string): ParsedVersion | null {
  if (!version) return null

  // Remove 'v' prefix
  const clean = version.replace(/^v/, '').trim()

  // Match semver pattern
  const match = clean.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(.+))?$/)

  if (!match) return null

  return {
    major: parseInt(match[1], 10) || 0,
    minor: parseInt(match[2], 10) || 0,
    patch: parseInt(match[3], 10) || 0,
    prerelease: match[4] || null,
    raw: version
  }
}

/**
 * Determine the type of version change
 */
export function getVersionChangeType(
  oldVersion: string | null,
  newVersion: string | null
): VersionChangeType {
  if (!oldVersion || !newVersion) return 'unknown'

  const oldParsed = parseVersion(oldVersion)
  const newParsed = parseVersion(newVersion)

  if (!oldParsed || !newParsed) return 'unknown'

  // Major bump first: 2.0.0-beta.1 after 1.x is a breaking jump, not a
  // cosmetic prerelease
  if (newParsed.major > oldParsed.major) {
    return 'major'
  }

  // Check prerelease
  if (newParsed.prerelease && !oldParsed.prerelease) {
    return 'prerelease'
  }

  // Minor bump
  if (newParsed.major === oldParsed.major && newParsed.minor > oldParsed.minor) {
    return 'minor'
  }

  // Patch bump
  if (
    newParsed.major === oldParsed.major &&
    newParsed.minor === oldParsed.minor &&
    newParsed.patch > oldParsed.patch
  ) {
    return 'patch'
  }

  return 'unknown'
}

/**
 * Check if a version change is likely breaking
 */
export function isBreakingChange(changeType: VersionChangeType): boolean {
  return changeType === 'major'
}

// ─────────────────────────────────────────────────────────────
// History Management
// ─────────────────────────────────────────────────────────────

/** Maximum history entries to keep */
const MAX_HISTORY_ENTRIES = 50

/**
 * Append a version to history if it's new
 *
 * Modifies versionData in place.
 */
export function appendVersionHistory(
  versionData: VersionData,
  newVersion: string,
  releaseDate: string | null
): VersionHistoryEntry | null {
  // Initialize history if needed
  if (!versionData.history) {
    versionData.history = []
  }

  // Check if this version is already in history
  const exists = versionData.history.some(h => h.version === newVersion)
  if (exists) return null

  // Get the previous version for comparison
  const lastEntry = versionData.history[0]
  const lastVersion = lastEntry?.version ?? versionData.lastAnalyzedVersion ?? null

  // Determine change type
  const changeType = getVersionChangeType(lastVersion, newVersion)

  // Create history entry
  const entry: VersionHistoryEntry = {
    version: newVersion,
    date: releaseDate ?? new Date().toISOString(),
    type: changeType,
    breaking: isBreakingChange(changeType)
  }

  // Prepend to history (newest first)
  versionData.history.unshift(entry)

  // Trim history if too long
  if (versionData.history.length > MAX_HISTORY_ENTRIES) {
    versionData.history = versionData.history.slice(0, MAX_HISTORY_ENTRIES)
  }

  return entry
}

/**
 * Get version history for a tool
 */
export function getVersionHistory(versionData: VersionData): VersionHistoryEntry[] {
  return versionData.history ?? []
}

/**
 * Get breaking changes from history
 */
export function getBreakingChanges(versionData: VersionData): VersionHistoryEntry[] {
  return (versionData.history ?? []).filter(h => h.breaking)
}

/**
 * Get major version changes from history
 */
export function getMajorChanges(versionData: VersionData): VersionHistoryEntry[] {
  return (versionData.history ?? []).filter(h => h.type === 'major')
}
