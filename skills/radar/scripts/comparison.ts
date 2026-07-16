#!/usr/bin/env bun
/**
 * Comparison Report Generator
 *
 * Generates markdown comparison reports from JSON comparison data.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRegistry } from './core'
import type { ComparisonData, FeatureDefinition, FeatureValue, Registry, Tool } from './core'

// ─────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESEARCH_DIR = join(process.cwd(), '.radar')
const COMPARISONS_DIR = join(RESEARCH_DIR, 'comparisons')
const REPORTS_DIR = join(RESEARCH_DIR, 'reports')
const REGISTRY_PATH = join(RESEARCH_DIR, 'registry.json')

// ─────────────────────────────────────────────────────────────
// Colors
// ─────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const NC = '\x1b[0m'

function log(color: string, message: string): void {
  console.log(`${color}${message}${NC}`)
}

// ─────────────────────────────────────────────────────────────
// Comparison Loading
// ─────────────────────────────────────────────────────────────

interface ComparisonEntry {
  category: string
  data: ComparisonData
}

function loadComparison(category: string): ComparisonData | null {
  const filePath = join(COMPARISONS_DIR, `${category}.json`)
  if (!existsSync(filePath)) {
    return null
  }
  return JSON.parse(readFileSync(filePath, 'utf8')) as ComparisonData
}

function loadAllComparisons(): ComparisonEntry[] {
  if (!existsSync(COMPARISONS_DIR)) {
    return []
  }

  const files = readdirSync(COMPARISONS_DIR).filter(f => f.endsWith('.json'))
  return files
    .map(f => {
      const category = f.replace('.json', '')
      const data = loadComparison(category)
      return data ? { category, data } : null
    })
    .filter((c): c is ComparisonEntry => c !== null)
}

// ─────────────────────────────────────────────────────────────
// Markdown Generation
// ─────────────────────────────────────────────────────────────

function generateMarkdownTable(comparison: ComparisonData): string {
  const { features, tools } = comparison
  const toolIds = Object.keys(tools ?? {})

  if (toolIds.length === 0 || !features || features.length === 0) {
    return ''
  }

  // Header
  let md = '| Feature |'
  for (const toolId of toolIds) {
    md += ` ${toolId} |`
  }
  md += '\n|---------|'
  for (const _toolId of toolIds) {
    md += '---------|'
  }
  md += '\n'

  // Rows
  for (const feature of features) {
    md += `| ${feature.name} |`
    for (const toolId of toolIds) {
      const toolData = tools?.[toolId]
      const featureData = toolData?.[feature.id]

      let cell = '-'
      if (featureData) {
        if (typeof featureData.value === 'boolean') {
          cell = featureData.value ? '✓' : '✗'
        } else if (featureData.value !== null && featureData.value !== undefined) {
          cell = String(featureData.value)
        }
        if (featureData.notes) {
          cell += ` (${featureData.notes})`
        }
      }
      md += ` ${cell} |`
    }
    md += '\n'
  }

  return md
}

// ─────────────────────────────────────────────────────────────
// Report Generation
// ─────────────────────────────────────────────────────────────

function generateFullReport(): string {
  const comparisons = loadAllComparisons()
  const registry = loadRegistry(REGISTRY_PATH)

  let report = `# AI Orchestration Tool Comparison

Generated: ${new Date().toISOString().split('T')[0]}

This report compares tracked tools by category.

---

`

  // Add registry summary
  report += `## Tracked Tools Summary

| Category | Count |
|----------|-------|
`

  const categoryCounts: Record<string, number> = {}
  for (const tool of registry.tools) {
    categoryCounts[tool.category] = (categoryCounts[tool.category] || 0) + 1
  }
  for (const [cat, count] of Object.entries(categoryCounts)) {
    report += `| ${cat} | ${count} |\n`
  }

  report += `\n**Total: ${registry.tools.length} tools tracked**\n\n---\n\n`

  // Add comparison tables
  for (const { category, data } of comparisons) {
    report += `## ${data.description || category}\n\n`
    report += generateMarkdownTable(data)
    report += '\n---\n\n'
  }

  // Add starred repos section
  const starredTools = registry.tools.filter(t => t.tags?.includes('starred'))
  if (starredTools.length > 0) {
    report += `## Starred Repositories

These are repositories we've researched and are actively tracking:

| Tool | GitHub | Stars | Description |
|------|--------|-------|-------------|
`
    for (const tool of starredTools) {
      const toolWithStars = tool as Tool & { stars?: number }
      const stars = toolWithStars.stars ? `${(toolWithStars.stars / 1000).toFixed(1)}k` : '-'
      const source = typeof tool.source === 'string' ? tool.source : '-'
      report += `| ${tool.name} | ${source} | ${stars} | ${tool.description?.substring(0, 50) || '-'} |\n`
    }
    report += '\n---\n\n'
  }

  // Footer
  report += `## Notes

- ✓ = Feature supported
- ✗ = Feature not supported
- This report is auto-generated from research data
- Run \`bun radar.ts check\` to update version information
- Run \`bun comparison.ts\` to regenerate this report

---

*Generated by radar*
`

  return report
}

function compareTools(toolIds: string[]): string {
  const comparisons = loadAllComparisons()

  let report = `# Tool Comparison: ${toolIds.join(' vs ')}\n\n`
  report += `Generated: ${new Date().toISOString().split('T')[0]}\n\n`

  for (const { category, data } of comparisons) {
    // Filter to only requested tools
    const filteredTools: Record<string, Record<string, FeatureValue>> = {}
    for (const id of toolIds) {
      if (data.tools?.[id]) {
        filteredTools[id] = data.tools[id]
      }
    }

    if (Object.keys(filteredTools).length > 0) {
      const filteredData: ComparisonData = { ...data, tools: filteredTools }
      report += `## ${data.description || category}\n\n`
      report += generateMarkdownTable(filteredData)
      report += '\n'
    }
  }

  return report
}

// ─────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────

function getArg(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null
}

function main(): void {
  const args = process.argv.slice(2)
  const category = getArg(args, '--category')
  const format = getArg(args, '--format') ?? 'markdown'

  // Specific tools comparison — positional args only: skip flags AND the
  // value that follows a value-taking flag (--category X, --format json)
  const VALUE_FLAGS = new Set(['--category', '--format'])
  const specificTools = args.filter(
    (a, i) => !a.startsWith('-') && !VALUE_FLAGS.has(args[i - 1] ?? '')
  )
  if (specificTools.length >= 2) {
    const report = compareTools(specificTools)
    console.log(report)
    return
  }

  // Category-specific comparison
  if (category) {
    const comparison = loadComparison(category)
    if (!comparison) {
      log(RED, `No comparison data found for category: ${category}`)
      return
    }

    if (format === 'json') {
      console.log(JSON.stringify(comparison, null, 2))
    } else {
      console.log(`# ${comparison.description || category}\n`)
      console.log(generateMarkdownTable(comparison))
    }
    return
  }

  // Full report
  const report = generateFullReport()

  // Save to file
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true })
  }

  const reportPath = join(REPORTS_DIR, 'comparison-report.md')
  writeFileSync(reportPath, report)

  console.log(report)
  console.log('')
  log(GREEN, `Report saved to: ${reportPath}`)
}

main()
