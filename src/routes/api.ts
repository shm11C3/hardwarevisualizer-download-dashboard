import { Hono } from 'hono'
import { getDashboard } from '../lib/analytics'
import { collectDownloads } from '../lib/collector'
import type { AppEnv, ChannelFilter, DashboardQuery, ScopeFilter } from '../types'

const api = new Hono<AppEnv>()
const allowedDays = new Set([7, 30, 90, 365])
const allowedChannels = new Set<ChannelFilter>(['stable', 'all'])
const allowedScopes = new Set<ScopeFilter>(['installers', 'distribution', 'all'])

function parseDashboardQuery(url: URL): DashboardQuery | null {
  const days = Number(url.searchParams.get('days') ?? '30')
  const channel = (url.searchParams.get('channel') ?? 'stable') as ChannelFilter
  const scope = (url.searchParams.get('scope') ?? 'installers') as ScopeFilter

  if (!allowedDays.has(days) || !allowedChannels.has(channel) || !allowedScopes.has(scope)) {
    return null
  }

  return {
    days: days as DashboardQuery['days'],
    channel,
    scope,
  }
}

async function secureEquals(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  const leftBytes = new Uint8Array(leftHash)
  const rightBytes = new Uint8Array(rightHash)
  let mismatch = 0

  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }

  return mismatch === 0
}

// Prepared before next() so that error and not-found responses carry them too.
api.use('*', async (context, next) => {
  context.header('X-Content-Type-Options', 'nosniff')
  context.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  context.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  await next()
})

api.get('/dashboard', async (context) => {
  const query = parseDashboardQuery(new URL(context.req.url))
  if (!query) {
    return context.json(
      {
        error: 'invalid_query',
        message:
          'days は 7, 30, 90, 365、channel は stable または all、scope は installers, distribution, all を指定してください。',
      },
      400,
    )
  }

  const response = await getDashboard(context.env, query)
  context.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
  return context.json(response)
})

api.get('/health', async (context) => {
  const database = await (context.env.DB as D1Database)
    .prepare('SELECT 1 AS ok')
    .first<{ ok: number }>()
  context.header('Cache-Control', 'no-store')
  return context.json({
    status: database?.ok === 1 ? 'ok' : 'degraded',
    repository: `${context.env.GITHUB_OWNER ?? 'shm11C3'}/${context.env.GITHUB_REPO ?? 'HardwareVisualizer'}`,
    timeZone: context.env.TIME_ZONE ?? 'Asia/Tokyo',
    checkedAt: new Date().toISOString(),
  })
})

api.post('/admin/collect', async (context) => {
  const configuredToken = context.env.COLLECT_TOKEN
  if (!configuredToken) {
    return context.json(
      {
        error: 'collector_disabled',
        message: 'COLLECT_TOKEN が設定されていないため、手動収集は無効です。',
      },
      503,
    )
  }

  const authorization = context.req.header('Authorization') ?? ''
  const providedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!providedToken || !(await secureEquals(providedToken, configuredToken))) {
    return context.json({ error: 'unauthorized', message: '認証に失敗しました。' }, 401)
  }

  const result = await collectDownloads(context.env)
  context.header('Cache-Control', 'no-store')
  return context.json({ status: 'ok', result })
})

export default api
