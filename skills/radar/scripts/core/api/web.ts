/**
 * Web Page Client
 *
 * Version detection for sources with no package registry and no public
 * repo — closed-source products that only publish a changelog / release
 * notes page. Fetch the page, strip markup, take the first version-shaped
 * match. `pattern` overrides the default when the page's first number is
 * not the version.
 */

import { fetchText } from './client.ts'
import type { VersionResult } from '../types.ts'

/** First X.Y[.Z][-suffix] on the page, optional leading "v" — same shape
 * as reports.ts VERSION_HEADING so both layers agree on what a version is */
const DEFAULT_VERSION = /\bv?(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)\b/

/**
 * Strip markup so version matching sees rendered text only.
 * Whole tags go, which also drops asset URLs (`jquery-3.6.0.min.js`)
 * that would otherwise win the "first version on the page" race.
 */
function toText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
}

/**
 * Get the latest version from a changelog / release notes page.
 *
 * @param pattern Custom regex source; capture group 1 wins if present
 */
export async function getWebVersion(url: string, pattern?: string): Promise<VersionResult> {
  try {
    const html = await fetchText(url)

    if (html === null) {
      return { version: null, publishedAt: null, error: 'page not found (404)' }
    }

    const regex = pattern ? new RegExp(pattern) : DEFAULT_VERSION
    const match = toText(html).match(regex)

    if (!match) {
      return {
        version: null,
        publishedAt: null,
        error: `no version match on page (pattern: ${regex.source})`
      }
    }

    // Pages carry no reliable publish date — leave it unset rather than
    // guess; a wrong date silently drives the staleness report.
    return { version: match[1] ?? match[0], publishedAt: null, error: null }
  } catch (err) {
    return {
      version: null,
      publishedAt: null,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}
