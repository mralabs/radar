/**
 * Registry Management
 *
 * Load and save tool registry data.
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import type { Registry, Versions } from './types'

/**
 * Write via tmp + rename so an interrupted process never leaves a
 * half-written JSON file behind
 */
function writeFileAtomic(path: string, data: string): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, path)
}

// ─────────────────────────────────────────────────────────────
// Default Data
// ─────────────────────────────────────────────────────────────

const DEFAULT_REGISTRY: Registry = {
  version: '1.0.0',
  categories: {},
  tools: []
}

const DEFAULT_VERSIONS: Versions = {
  lastChecked: null,
  tools: {}
}

// ─────────────────────────────────────────────────────────────
// Registry Operations
// ─────────────────────────────────────────────────────────────

/**
 * Load registry data from file
 */
export function loadRegistry(path: string): Registry {
  if (!existsSync(path)) {
    return { ...DEFAULT_REGISTRY }
  }

  // Parse/shape errors must fail loud: silently returning a default here
  // means the next save would wipe every tracked tool.
  let parsed: Registry
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as Registry
  } catch (err) {
    throw new Error(
      `${path} is corrupt (${err instanceof Error ? err.message : 'parse error'}). ` +
        'Fix or delete it before continuing — refusing to overwrite tracked tools.'
    )
  }

  if (!Array.isArray(parsed.tools) || typeof parsed.categories !== 'object' || parsed.categories === null) {
    throw new Error(
      `${path} is not a valid registry: expected { categories: object, tools: array }. ` +
        'Fix or delete it before continuing.'
    )
  }

  return parsed
}

/**
 * Save registry data to file
 */
export function saveRegistry(path: string, registry: Registry): void {
  const data = {
    ...registry,
    lastUpdated: new Date().toISOString()
  }

  writeFileAtomic(path, JSON.stringify(data, null, 2))
}

// ─────────────────────────────────────────────────────────────
// Versions Operations
// ─────────────────────────────────────────────────────────────

/**
 * Load versions data from file
 */
export function loadVersions(path: string): Versions {
  if (!existsSync(path)) {
    return { ...DEFAULT_VERSIONS }
  }

  let parsed: Versions
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as Versions
  } catch (err) {
    throw new Error(
      `${path} is corrupt (${err instanceof Error ? err.message : 'parse error'}). ` +
        'Fix or delete it before continuing — refusing to overwrite version history.'
    )
  }

  if (typeof parsed.tools !== 'object' || parsed.tools === null) {
    throw new Error(
      `${path} is not a valid versions file: expected { tools: object }. ` +
        'Fix or delete it before continuing.'
    )
  }

  return parsed
}

/**
 * Save versions data to file
 */
export function saveVersions(path: string, versions: Versions): void {
  const data = {
    ...versions,
    lastChecked: new Date().toISOString()
  }

  writeFileAtomic(path, JSON.stringify(data, null, 2))
}
