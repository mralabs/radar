/**
 * HTTP Client Tests — network stubbed, deterministic
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
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

    expect(data?.id).toBe(1)
    expect(data?.title).toBe('hello')
  })

  it('should return null for 404', async () => {
    stubFetch(() => new Response('not found', { status: 404 }))

    const data = await fetchJson('https://example.test/missing')

    expect(data).toBeNull()
  })

  it('should throw on network failure', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed')
    })

    await expect(fetchJson('https://example.test/api')).rejects.toThrow()
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

    expect(seen['x-custom-header']).toBe('test')
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

    expect(await getNuGetRepoUrl('MyPkg')).toBe('https://github.com/o/r')
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

    expect(await getNuGetRepoUrl('mypkg')).toBe('https://github.com/o/r')
  })

  it('returns null when the package is unknown', async () => {
    stubFetch(() => new Response('not found', { status: 404 }))
    expect(await getNuGetRepoUrl('ghost')).toBeNull()
  })
})
