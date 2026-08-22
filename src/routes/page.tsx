import type { NotFoundHandler } from 'hono'
import { Hono } from 'hono'
import { getDashboard } from '../lib/analytics'
import { stylesheetHref } from '../lib/asset-version'
import { CACHE_BUST_PARAM, coerceDashboardQuery } from '../lib/query'
import { DOCUMENT_SECURITY_HEADERS } from '../lib/security'
import type { AppEnv } from '../types'
import { DashboardPage, ErrorPage } from '../views/DashboardPage'
import { Layout } from '../views/Layout'

const DOCUMENT_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=600'

const page = new Hono<AppEnv>()

page.get('/', async (context) => {
  const url = new URL(context.req.url)
  const query = coerceDashboardQuery(url)
  // A refreshed view must reach the origin rather than the five-minute cache,
  // and it hands the next refresh a newer nonce than the one it was reached by.
  const bypassCache = url.searchParams.has(CACHE_BUST_PARAM)
  const nonce = Date.now()

  for (const [name, value] of Object.entries(DOCUMENT_SECURITY_HEADERS)) {
    context.header(name, value)
  }

  const stylesheet = await stylesheetHref(context.env, url.origin)

  try {
    const data = await getDashboard(context.env, query)
    context.header('Cache-Control', bypassCache ? 'no-store' : DOCUMENT_CACHE_CONTROL)
    return context.html(
      <Layout stylesheet={stylesheet}>
        <DashboardPage data={data} query={query} nonce={nonce} />
      </Layout>,
    )
  } catch (error) {
    const requestId = crypto.randomUUID()
    console.error(
      JSON.stringify({
        requestId,
        route: 'page',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
    )
    context.header('Cache-Control', 'no-store')
    return context.html(
      <Layout stylesheet={stylesheet}>
        <ErrorPage query={query} nonce={nonce} />
      </Layout>,
      500,
    )
  }
})

export default page

// The Worker now answers browser navigations as well as API calls, so an
// unknown path needs an HTML answer rather than the API's JSON envelope.
export const notFoundPage: NotFoundHandler<AppEnv> = async (context) => {
  for (const [name, value] of Object.entries(DOCUMENT_SECURITY_HEADERS)) {
    context.header(name, value)
  }
  context.header('Cache-Control', 'no-store')
  const stylesheet = await stylesheetHref(context.env, new URL(context.req.url).origin)
  return context.html(
    <Layout stylesheet={stylesheet}>
      <section class="empty-state">
        <div class="empty-icon">↘</div>
        <h2>ページが見つかりません</h2>
        <p>お探しのページは存在しないか、移動した可能性があります。</p>
        <a class="refresh-button" href="/">
          ダッシュボードへ
        </a>
      </section>
    </Layout>,
    404,
  )
}
