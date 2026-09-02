/**
 * Web Page Client
 *
 * Version detection for sources with no package registry and no public
 * repo — closed-source products that only publish a changelog / release
 * notes page. Fetch the page and take the first version-shaped match in
 * its rendered text. `pattern` overrides that default when the page's
 * first number is not the version.
 *
 * A `pattern` is tried against the rendered text first and, only if that
 * finds nothing, against the page as served. Order matters both ways.
 * Rendered text first, because markup is where the false positives live:
 * `<meta content="Conductor 1.4.0">` sits above the body, so a pattern
 * read against raw HTML would quietly return an older version than the
 * page displays — a version regression, reported as a normal result.
 * Page source second, because some pages keep the version nowhere else:
 * a Mintlify changelog publishes it only as `<Update label="v0.22.0">`,
 * which the strip deletes. The fallback can only find matches the strip
 * hid; it never changes an answer the rendered text already gave.
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
 * @param pattern Custom regex source, tried against the rendered text and
 *   then the page source; capture group 1 wins if present
 */
export async function getWebVersion(url: string, pattern?: string): Promise<VersionResult> {
  try {
    const html = await fetchText(url)

    if (html === null) {
      return { version: null, publishedAt: null, error: 'page not found (404)' }
    }

    const regex = pattern ? new RegExp(pattern) : DEFAULT_VERSION
    const text = toText(html)

    // The default never sees raw HTML: the strip is the only thing keeping
    // "first version-shaped string" off asset URLs and inline scripts.
    const match = text.match(regex) ?? (pattern ? html.match(regex) : null)

    if (!match) {
      // Name every body that was searched. A pattern that visibly occurs
      // in the page but matches neither body is the failure this client
      // gets asked about most, and "no match" alone doesn't locate it.
      const scope = pattern ? 'rendered text or page source' : 'rendered text (markup stripped)'
      return {
        version: null,
        publishedAt: null,
        error: `no version match in ${scope} (pattern: ${regex.source})`
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
