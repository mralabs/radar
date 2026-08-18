/**
 * Web Adapter Tests — network stubbed, deterministic
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { getWebVersion } from '../skills/radar/scripts/core/api/web.ts'

const realFetch = globalThis.fetch

function stubHtml(body: string, status = 200): void {
  globalThis.fetch = (async (_input: string | URL | Request, _init?: RequestInit) =>
    new Response(body, { status, headers: { 'Content-Type': 'text/html' } })) as typeof fetch
}

describe('getWebVersion', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('should take the first version in the rendered text', async () => {
    stubHtml('<html><body><h2>v4.2.1 — Jan 2026</h2><h2>4.2.0</h2></body></html>')

    const result = await getWebVersion('https://example.test/changelog')

    assert.strictEqual(result.version, '4.2.1')
    assert.strictEqual(result.error, null)
  })

  it('should ignore versions inside markup and scripts', async () => {
    stubHtml(
      '<script src="/jquery-3.6.0.min.js"></script>' +
        '<script>var build="9.9.9"</script>' +
        '<link href="/app.css?v=2.0.0">' +
        '<main>Release 4.2.1</main>'
    )

    const result = await getWebVersion('https://example.test/changelog')

    assert.strictEqual(result.version, '4.2.1')
  })

  it('should honour a custom pattern with a capture group', async () => {
    stubHtml('<p>2026 roadmap</p><p>Conductor 1.4.7 is out</p>')

    const result = await getWebVersion(
      'https://example.test/changelog',
      'Conductor (\\d+\\.\\d+\\.\\d+)'
    )

    assert.strictEqual(result.version, '1.4.7')
  })

  it('should keep a prerelease suffix — beta→final must register as a change', async () => {
    stubHtml('<h2>1.2.3-beta.2</h2>')

    const result = await getWebVersion('https://example.test/changelog')

    assert.strictEqual(result.version, '1.2.3-beta.2')
  })

  it('should error instead of guessing when nothing matches', async () => {
    stubHtml('<p>No versions here.</p>')

    const result = await getWebVersion('https://example.test/changelog')

    assert.strictEqual(result.version, null)
    assert.ok(result.error?.includes('no version match'))
  })

  it('should report a 404 as an error, not a version', async () => {
    stubHtml('not found', 404)

    const result = await getWebVersion('https://example.test/gone')

    assert.strictEqual(result.version, null)
    assert.ok(result.error?.includes('404'))
  })

  it('should never invent a publish date', async () => {
    stubHtml('<h2>1.0.0 — released 2026-01-01</h2>')

    const result = await getWebVersion('https://example.test/changelog')

    assert.strictEqual(result.publishedAt, null)
  })
})
