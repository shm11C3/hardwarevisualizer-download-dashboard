import { Hono } from 'hono'
import { getDashboard } from '../lib/analytics'
import { collectAll } from '../lib/collector'
import { buildSeriesCsv } from '../lib/export'
import { parseDashboardQuery } from '../lib/query'
import { BASELINE_SECURITY_HEADERS } from '../lib/security'
import type { AppEnv } from '../types'

const api = new Hono<AppEnv>()

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
  for (const [name, value] of Object.entries(BASELINE_SECURITY_HEADERS)) {
    context.header(name, value)
  }
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

api.get('/export.csv', async (context) => {
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
  const series = response.status === 'ok' ? response.series : []
  context.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
  context.header('Content-Type', 'text/csv; charset=utf-8')
  context.header(
    'Content-Disposition',
    `attachment; filename="hardviz-downloads-${query.days}d-${query.channel}-${query.scope}.csv"`,
  )
  return context.body(buildSeriesCsv(series))
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

  const result = await collectAll(context.env)
  context.header('Cache-Control', 'no-store')
  return context.json({ status: 'ok', result })
})

export default api
