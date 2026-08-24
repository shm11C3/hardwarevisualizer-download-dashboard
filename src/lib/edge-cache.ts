import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'
import { CACHE_BUST_PARAM, coerceDashboardQuery, parseDashboardQuery } from './query'

interface MemoryCacheEntry {
  status: number
  headers: [string, string][]
  body: ArrayBuffer
  expiresAt: number
}

type CloudflareCacheStorage = CacheStorage & { readonly default: Cache }

export interface EdgeCacheOptions {
  now?: () => number
}

const memoryCache = new Map<string, MemoryCacheEntry>()
const MEMORY_CACHE_LIMIT = 128

export function canonicalCacheUrl(url: URL): string | null {
  const query =
    url.pathname === '/'
      ? coerceDashboardQuery(url)
      : url.pathname === '/api/dashboard' || url.pathname === '/api/export.csv'
        ? parseDashboardQuery(url)
        : null

  if (!query) {
    return null
  }

  return `${url.origin}${url.pathname}?days=${query.days}&channel=${query.channel}&scope=${query.scope}`
}

export function shouldBypass(url: URL): boolean {
  return url.searchParams.has(CACHE_BUST_PARAM)
}

export function parseMaxAge(cacheControl: string | null): number | null {
  if (!cacheControl) {
    return null
  }

  const directives = cacheControl.split(',').map((directive) => directive.trim())
  if (!directives.some((directive) => directive.toLowerCase() === 'public')) {
    return null
  }

  for (const directive of directives) {
    const match = /^max-age\s*=\s*"?(\d+)"?$/i.exec(directive)
    if (match?.[1]) {
      return Number(match[1])
    }
  }

  return null
}

function memoryResponse(key: string, now: number): Response | null {
  const entry = memoryCache.get(key)
  if (!entry) {
    return null
  }
  if (entry.expiresAt <= now) {
    memoryCache.delete(key)
    return null
  }

  return new Response(entry.body.slice(0), {
    status: entry.status,
    headers: entry.headers,
  })
}

async function storeMemoryResponse(
  key: string,
  response: Response,
  ttl: number,
  now: number,
): Promise<void> {
  const headers: [string, string][] = []
  response.headers.forEach((value, name) => {
    headers.push([name, value])
  })
  memoryCache.set(key, {
    status: response.status,
    headers,
    body: await response.clone().arrayBuffer(),
    expiresAt: now + ttl * 1_000,
  })

  if (memoryCache.size > MEMORY_CACHE_LIMIT) {
    memoryCache.clear()
  }
}

function withCacheStatus(response: Response, status: 'hit-memory' | 'hit-edge'): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Cache', status)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function edgeCache(options: EdgeCacheOptions = {}): MiddlewareHandler<AppEnv> {
  const now = options.now ?? Date.now

  return async (context, next) => {
    if (context.req.method !== 'GET') {
      await next()
      return
    }

    const url = new URL(context.req.url)
    const canonicalUrl = canonicalCacheUrl(url)
    if (!canonicalUrl || shouldBypass(url)) {
      await next()
      return
    }

    const inMemory = memoryResponse(canonicalUrl, now())
    if (inMemory) {
      return withCacheStatus(inMemory, 'hit-memory')
    }

    let cache: Cache | undefined
    try {
      const defaultCache = (caches as CloudflareCacheStorage).default
      cache = defaultCache
      const cached = await defaultCache.match(canonicalUrl)
      if (cached) {
        return withCacheStatus(cached, 'hit-edge')
      }
    } catch {
      cache = undefined
    }

    await next()

    const response = context.res
    const ttl = parseMaxAge(response.headers.get('Cache-Control'))
    if (response.status === 200 && ttl !== null && ttl > 0) {
      await storeMemoryResponse(canonicalUrl, response, ttl, now()).catch(() => {})

      if (cache) {
        try {
          const putPromise = cache.put(canonicalUrl, response.clone())
          try {
            context.executionCtx.waitUntil(putPromise.catch(() => {}))
          } catch {
            // Hono's test request has no execution context to extend.
            void putPromise.catch(() => {})
          }
        } catch {
          // Cache API availability must never decide whether the route succeeds.
        }
      }
    }

    context.header('X-Cache', 'miss')
  }
}
