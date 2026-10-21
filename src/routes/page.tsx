import type { NotFoundHandler } from 'hono'
import { Hono } from 'hono'
import { getDashboard } from '../lib/analytics'
import { stylesheetHref } from '../lib/asset-version'
import { canonicalHref } from '../lib/canonical'
import { coerceDashboardQuery, dashboardHref, nonCanonicalRedirect } from '../lib/query'
import { DOCUMENT_SECURITY_HEADERS } from '../lib/security'
import type { AppEnv } from '../types'
import { DashboardPage, ErrorPage } from '../views/DashboardPage'
import { Layout } from '../views/Layout'

const DOCUMENT_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=600'
// The mapping from a stray spelling to its canonical URL never changes, so the
// redirect can sit in the edge cache far longer than the page it points to.
const REDIRECT_CACHE_CONTROL = 'public, max-age=86400'

const page = new Hono<AppEnv>()

page.get('/', async (context) => {
  const url = new URL(context.req.url)
  const query = coerceDashboardQuery(url)
  const redirectTo = nonCanonicalRedirect(url, dashboardHref(query).slice(1))
  if (redirectTo) {
    context.header('Cache-Control', REDIRECT_CACHE_CONTROL)
    return context.redirect(redirectTo, 301)
  }

  for (const [name, value] of Object.entries(DOCUMENT_SECURITY_HEADERS)) {
    context.header(name, value)
  }

  const stylesheet = await stylesheetHref(context.env, url.origin)
  // Filters only vary the URL, so every rendering of this route points at the
  // same canonical document.
  const canonical = canonicalHref(context.env, url)

  try {
    const data = await getDashboard(context.env, query)
    context.header('Cache-Control', DOCUMENT_CACHE_CONTROL)
    return context.html(
      <Layout stylesheet={stylesheet} canonical={canonical}>
        <DashboardPage data={data} query={query} />
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
      <Layout stylesheet={stylesheet} canonical={canonical}>
        <ErrorPage query={query} />
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
  // A missing page has no canonical URL of its own, and pointing it at the
  // dashboard would ask Google to index this 404 as if it were the dashboard.
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
