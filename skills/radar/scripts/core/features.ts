/**
 * Auto Feature Extraction
 *
 * Extract features from README files automatically.
 */

import { fetchJson } from './api/client'
import { getAuthOptions } from './api/github'
import type { Tool } from './types'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ExtractedFeatures {
  tool: Tool
  features: string[]
  source: 'readme' | 'manual' | 'none'
  lastExtracted?: string
  error?: string
}

interface GitHubReadmeResponse {
  content?: string
  encoding?: string
}

// ─────────────────────────────────────────────────────────────
// README Fetching
// ─────────────────────────────────────────────────────────────

/**
 * Fetch README content from GitHub
 */
async function fetchGitHubReadme(repo: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${repo}/readme`

  try {
    const response = await fetchJson<GitHubReadmeResponse>(url, getAuthOptions())

    if (!response?.content) return null

    // Decode base64 content
    const decoded = Buffer.from(response.content, 'base64').toString('utf8')
    return decoded
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Markdown Parsing
// ─────────────────────────────────────────────────────────────

interface MarkdownSection {
  heading: string
  level: number
  content: string
}

/**
 * Parse markdown into sections
 */
function parseMarkdownSections(content: string): MarkdownSection[] {
  const lines = content.split('\n')
  const sections: MarkdownSection[] = []
  let currentSection: MarkdownSection | null = null

  for (const line of lines) {
    // Check for headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection)
      }

      // Start new section
      currentSection = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        content: ''
      }
    } else if (currentSection) {
      currentSection.content += line + '\n'
    }
  }

  // Save last section
  if (currentSection) {
    sections.push(currentSection)
  }

  return sections
}

/**
 * Extract bullet points from markdown content
 */
function extractBulletPoints(content: string): string[] {
  const lines = content.split('\n')
  const bullets: string[] = []

  for (const line of lines) {
    // Match bullet points: -, *, •
    const bulletMatch = line.match(/^\s*[-*•]\s+(.+)$/)
    if (bulletMatch) {
      const text = bulletMatch[1]
        .replace(/\*\*(.+?)\*\*/g, '$1')  // Remove bold
        .replace(/\*(.+?)\*/g, '$1')      // Remove italic
        .replace(/`(.+?)`/g, '$1')        // Remove code
        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
        .trim()

      if (text.length > 3 && text.length < 100) {
        bullets.push(text)
      }
    }
  }

  return bullets
}

// ─────────────────────────────────────────────────────────────
// Feature Extraction
// ─────────────────────────────────────────────────────────────

/** Section headings that typically contain features */
const FEATURE_SECTION_PATTERNS = [
  /^features?$/i,
  /^key features?$/i,
  /^highlights?$/i,
  /^what's new$/i,
  /^capabilities$/i,
  /^what it does$/i,
  /^overview$/i,
  /^getting started$/i,
  /^usage$/i
]

/**
 * Extract features from a README
 */
function extractFeaturesFromReadme(readme: string): string[] {
  const sections = parseMarkdownSections(readme)

  // Find feature-related sections
  const featureSections = sections.filter(s =>
    FEATURE_SECTION_PATTERNS.some(pattern => pattern.test(s.heading))
  )

  if (featureSections.length === 0) {
    // Try to find features in the first few sections
    const earlySections = sections.slice(0, 3)
    for (const section of earlySections) {
      const bullets = extractBulletPoints(section.content)
      if (bullets.length >= 3) {
        return bullets.slice(0, 10)
      }
    }
    return []
  }

  // Extract bullet points from feature sections
  const allFeatures: string[] = []
  for (const section of featureSections) {
    const bullets = extractBulletPoints(section.content)
    allFeatures.push(...bullets)
  }

  // Deduplicate and limit
  const unique = [...new Set(allFeatures)]
  return unique.slice(0, 15)
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Extract features for a tool
 *
 * Fetches README from GitHub and extracts feature list.
 */
export async function extractToolFeatures(tool: Tool): Promise<ExtractedFeatures> {
  // Only works for GitHub tools
  if (tool.type !== 'github') {
    return {
      tool,
      features: tool.features ?? [],
      source: 'manual',
      error: `Feature extraction only available for GitHub repos. ${tool.name} is type: ${tool.type}`
    }
  }

  const source = typeof tool.source === 'string' ? tool.source : tool.source.repo

  if (!source) {
    return {
      tool,
      features: tool.features ?? [],
      source: 'manual',
      error: 'No source repo'
    }
  }

  try {
    const readme = await fetchGitHubReadme(source)

    if (!readme) {
      return {
        tool,
        features: tool.features ?? [],
        source: 'manual',
        error: 'Could not fetch README'
      }
    }

    const features = extractFeaturesFromReadme(readme)

    if (features.length === 0) {
      return {
        tool,
        features: tool.features ?? [],
        source: 'manual',
        error: 'No features found in README'
      }
    }

    return {
      tool,
      features,
      source: 'readme',
      lastExtracted: new Date().toISOString()
    }
  } catch (error) {
    return {
      tool,
      features: tool.features ?? [],
      source: 'manual',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Compare extracted features with existing features
 */
export function compareFeatures(
  existing: string[],
  extracted: string[]
): {
  added: string[]
  removed: string[]
  unchanged: string[]
} {
  const existingSet = new Set(existing.map(f => f.toLowerCase()))
  const extractedSet = new Set(extracted.map(f => f.toLowerCase()))

  const added = extracted.filter(f => !existingSet.has(f.toLowerCase()))
  const removed = existing.filter(f => !extractedSet.has(f.toLowerCase()))
  const unchanged = existing.filter(f => extractedSet.has(f.toLowerCase()))

  return { added, removed, unchanged }
}
