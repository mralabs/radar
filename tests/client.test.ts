/**
 * HTTP Client Tests — network stubbed, deterministic
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { fetchJson } from '../skills/radar/scripts/core/api/client.ts'
import { getNuGetRepoUrl } from '../skills/radar/scripts/core/api/nuget.ts'

const realFetch = globalThis.fetch

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch
}

describe('fetchJson', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('should fetch and parse JSON', async () => {
    stubFetch(() => Response.json({ id: 1, title: 'hello' }))

    const data = await fetchJson<{ id: number; title: string }>('https://example.test/todos/1')

    assert.strictEqual(data?.id, 1)
    assert.strictEqual(data?.title, 'hello')
  })

  it('should return null for 404', async () => {
    stubFetch(() => new Response('not found', { status: 404 }))

    const data = await fetchJson('https://example.test/missing')

    assert.strictEqual(data, null)
  })

  it('should throw on network failure', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed')
    })

    await assert.rejects(fetchJson('https://example.test/api'))
  })

  it('should pass custom headers through', async () => {
    let seen: Record<string, string> = {}
    stubFetch((_url, init) => {
      seen = Object.fromEntries(new Headers(init?.headers).entries())
      return Response.json({ ok: true })
    })

    await fetchJson('https://example.test/todos/1', {
      headers: { 'X-Custom-Header': 'test' }
    })

    assert.strictEqual(seen['x-custom-header'], 'test')
  })
})

describe('getNuGetRepoUrl', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('resolves projectUrl from an inlined registration page', async () => {
    stubFetch(url => {
      if (url.includes('/registration5-semver1/mypkg/index.json')) {
        return Response.json({
          items: [{ items: [{ catalogEntry: { projectUrl: 'https://github.com/o/r' } }] }]
        })
      }
      return new Response('not found', { status: 404 })
    })

    assert.strictEqual(await getNuGetRepoUrl('MyPkg'), 'https://github.com/o/r')
  })

  it('follows a page reference when leaves are not inlined', async () => {
    stubFetch(url => {
      if (url.includes('/index.json')) {
        return Response.json({ items: [{ '@id': 'https://example.test/page2.json' }] })
      }
      if (url.includes('page2.json')) {
        return Response.json({
          items: [
            { catalogEntry: { projectUrl: 'https://github.com/o/old' } },
            { catalogEntry: { projectUrl: 'https://github.com/o/r' } }
          ]
        })
      }
      return new Response('not found', { status: 404 })
    })

    assert.strictEqual(await getNuGetRepoUrl('mypkg'), 'https://github.com/o/r')
  })

  it('returns null when the package is unknown', async () => {
    stubFetch(() => new Response('not found', { status: 404 }))
    assert.strictEqual(await getNuGetRepoUrl('ghost'), null)
  })
})
