import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { canonicalCacheUrl, edgeCache, parseMaxAge, shouldBypass } from '../src/lib/edge-cache'
import type { AppEnv } from '../src/types'

describe('canonicalCacheUrl', () => {
  it('drops extra parameters and normalizes parameter order', () => {
    const first = canonicalCacheUrl(
      new URL('https://example.com/api/dashboard?scope=all&extra=junk&channel=stable&days=90'),
    )
    const second = canonicalCacheUrl(
      new URL('https://example.com/api/dashboard?days=90&channel=stable&scope=all'),
    )

    expect(first).toBe('https://example.com/api/dashboard?days=90&channel=stable&scope=all')
    expect(first).toBe(second)
  })

  it('coerces invalid page filters to the same defaults as a plain page URL', () => {
    expect(
      canonicalCacheUrl(
        new URL('https://example.com/?days=12&channel=nightly&scope=unknown&extra=junk'),
      ),
    ).toBe(canonicalCacheUrl(new URL('https://example.com/')))
  })

  it('rejects invalid API filters and unknown paths', () => {
    expect(
      canonicalCacheUrl(
        new URL('https://example.com/api/dashboard?days=12&channel=stable&scope=all'),
      ),
    ).toBeNull()
    expect(canonicalCacheUrl(new URL('https://example.com/api/health'))).toBeNull()
  })

  it('embeds every dashboard filter in a fixed order', () => {
    expect(
      canonicalCacheUrl(
        new URL('https://example.com/api/export.csv?scope=distribution&days=365&channel=all'),
      ),
    ).toBe('https://example.com/api/export.csv?days=365&channel=all&scope=distribution')
  })
})

describe('shouldBypass', () => {
  it('detects the cache-busting parameter', () => {
    expect(shouldBypass(new URL('https://example.com/?t=123'))).toBe(true)
    expect(shouldBypass(new URL('https://example.com/'))).toBe(false)
  })
})

describe('parseMaxAge', () => {
  it('reads max-age from a public response', () => {
    expect(parseMaxAge('public, max-age=300, stale-while-revalidate=600')).toBe(300)
  })

  it('rejects responses that are not explicitly public', () => {
    expect(parseMaxAge('no-store')).toBeNull()
    expect(parseMaxAge(null)).toBeNull()
    expect(parseMaxAge('max-age=300')).toBeNull()
  })
})

describe('edgeCache', () => {
  it('serves memory entries until their injected expiry time', async () => {
    let currentTime = 1_000
    let handlerCalls = 0
    const app = new Hono<AppEnv>()
    app.use('*', edgeCache({ now: () => currentTime }))
    app.get('/', (context) => {
      handlerCalls += 1
      context.header('Cache-Control', 'public, max-age=10')
      return context.text(`response-${handlerCalls}`)
    })

    const url = 'https://ttl.example/?days=7&channel=stable&scope=installers'
    expect(await (await app.request(url)).text()).toBe('response-1')

    currentTime += 9_999
    const fresh = await app.request(url)
    expect(await fresh.text()).toBe('response-1')
    expect(fresh.headers.get('X-Cache')).toBe('hit-memory')
    expect(handlerCalls).toBe(1)

    currentTime += 1
    expect(await (await app.request(url)).text()).toBe('response-2')
    expect(handlerCalls).toBe(2)
  })

  it('caches canonical GET requests in memory and bypasses requests with t', async () => {
    let handlerCalls = 0
    const app = new Hono<AppEnv>()
    app.use('*', edgeCache())
    app.get('/', (context) => {
      handlerCalls += 1
      context.header('Cache-Control', 'public, max-age=300')
      return context.text(`response-${handlerCalls}`)
    })

    const url = '/?days=30&channel=stable&scope=installers'
    expect(await (await app.request(url)).text()).toBe('response-1')

    const cached = await app.request(url)
    expect(await cached.text()).toBe('response-1')
    expect(cached.headers.get('X-Cache')).toBe('hit-memory')
    expect(handlerCalls).toBe(1)

    expect(await (await app.request(`${url}&t=1`)).text()).toBe('response-2')
    expect(handlerCalls).toBe(2)
  })

  it('never stores no-store responses', async () => {
    let handlerCalls = 0
    const app = new Hono<AppEnv>()
    app.use('*', edgeCache())
    app.get('/', (context) => {
      handlerCalls += 1
      context.header('Cache-Control', 'no-store')
      return context.text(`response-${handlerCalls}`)
    })

    const url = 'https://no-store.example/?days=90&channel=all&scope=distribution'
    expect(await (await app.request(url)).text()).toBe('response-1')
    expect(await (await app.request(url)).text()).toBe('response-2')
    expect(handlerCalls).toBe(2)
  })
})
