import { Hono } from 'hono'
import { collectAll } from './lib/collector'
import { edgeCache } from './lib/edge-cache'
import api from './routes/api'
import page, { notFoundPage } from './routes/page'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

app.use('*', edgeCache())
app.route('/', page)
app.route('/api', api)

app.notFound((context) => {
  const { pathname } = new URL(context.req.url)
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return context.json(
      {
        error: 'not_found',
        message: '指定された API エンドポイントは存在しません。',
      },
      404,
    )
  }

  return notFoundPage(context)
})

app.onError((error, context) => {
  const requestId = crypto.randomUUID()
  console.error(JSON.stringify({ requestId, message: error.message, stack: error.stack }))
  context.header('Cache-Control', 'no-store')
  return context.json(
    {
      error: 'internal_error',
      message: '処理中にエラーが発生しました。',
      requestId,
    },
    500,
  )
})

export default {
  fetch: app.fetch,
  async scheduled(
    controller: ScheduledController,
    env: CloudflareBindings,
    _context: ExecutionContext,
  ): Promise<void> {
    await collectAll(env, new Date(controller.scheduledTime))
  },
} satisfies ExportedHandler<CloudflareBindings>
