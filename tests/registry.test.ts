/**
 * Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, unlinkSync, mkdirSync, rmdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  loadRegistry,
  saveRegistry,
  loadVersions,
  saveVersions
} from '../skills/radar/scripts/core/registry.ts'
import type { Registry, Versions } from '../skills/radar/scripts/core/types.ts'

const TEST_DIR = '/tmp/research-test'
const REGISTRY_PATH = join(TEST_DIR, 'registry.json')
const VERSIONS_PATH = join(TEST_DIR, 'versions.json')

describe('Registry', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    if (existsSync(REGISTRY_PATH)) unlinkSync(REGISTRY_PATH)
    if (existsSync(VERSIONS_PATH)) unlinkSync(VERSIONS_PATH)
    if (existsSync(TEST_DIR)) rmdirSync(TEST_DIR)
  })

  describe('loadRegistry', () => {
    it('should return default registry if file does not exist', () => {
      const registry = loadRegistry(REGISTRY_PATH)

      expect(registry.version).toBe('1.0.0')
      expect(registry.categories).toEqual({})
      expect(registry.tools).toEqual([])
    })

    it('should load existing registry', () => {
      const existing: Registry = {
        version: '2.0.0',
        categories: { test: { name: 'Test' } },
        tools: [
          { id: 'tool-1', name: 'Tool 1', category: 'test', type: 'github', source: 'a/b', url: null, status: 'active' }
        ]
      }

      saveRegistry(REGISTRY_PATH, existing)
      const loaded = loadRegistry(REGISTRY_PATH)

      expect(loaded.version).toBe('2.0.0')
      expect(loaded.tools).toHaveLength(1)
      expect(loaded.tools[0].id).toBe('tool-1')
    })
  })

  describe('saveRegistry', () => {
    it('should save registry with lastUpdated timestamp', () => {
      const registry: Registry = {
        version: '1.0.0',
        categories: {},
        tools: []
      }

      saveRegistry(REGISTRY_PATH, registry)

      const content = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
      expect(content.lastUpdated).toBeDefined()
      expect(content.version).toBe('1.0.0')
    })
  })

  describe('loadVersions', () => {
    it('should return default versions if file does not exist', () => {
      const versions = loadVersions(VERSIONS_PATH)

      expect(versions.lastChecked).toBeNull()
      expect(versions.tools).toEqual({})
    })

    it('should load existing versions', () => {
      const existing: Versions = {
        lastChecked: '2024-01-01T00:00:00.000Z',
        tools: {
          'tool-1': { currentVersion: '1.0.0' }
        }
      }

      saveVersions(VERSIONS_PATH, existing)
      const loaded = loadVersions(VERSIONS_PATH)

      expect(loaded.tools['tool-1'].currentVersion).toBe('1.0.0')
    })
  })

  describe('saveVersions', () => {
    it('should save versions with lastChecked timestamp', () => {
      const versions: Versions = {
        lastChecked: null,
        tools: {}
      }

      saveVersions(VERSIONS_PATH, versions)

      const content = JSON.parse(readFileSync(VERSIONS_PATH, 'utf8'))
      expect(content.lastChecked).toBeDefined()
    })
  })
})

describe('load validation and atomic saves', () => {
  const TEST_DIR = join(process.cwd(), '.test-registry-validation')
  const REG = join(TEST_DIR, 'registry.json')
  const VER = join(TEST_DIR, 'versions.json')

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('loadRegistry throws a clear error on malformed JSON', () => {
    writeFileSync(REG, '{broken')
    expect(() => loadRegistry(REG)).toThrow(/corrupt/)
  })

  it('loadRegistry throws on valid JSON with wrong shape', () => {
    writeFileSync(REG, JSON.stringify({ tools: 'oops' }))
    expect(() => loadRegistry(REG)).toThrow(/not a valid registry/)
  })

  it('loadVersions throws on wrong shape', () => {
    writeFileSync(VER, JSON.stringify({ tools: 42 }))
    expect(() => loadVersions(VER)).toThrow(/not a valid versions file/)
  })

  it('saveRegistry writes atomically — no tmp file left, content valid', () => {
    const registry = { version: '1.0.0', categories: {}, tools: [] }
    saveRegistry(REG, registry)

    expect(existsSync(`${REG}.tmp`)).toBe(false)
    expect(loadRegistry(REG).tools).toEqual([])
  })
})
