import type {
  ChannelFilter,
  DashboardPageQuery,
  DashboardQuery,
  ScopeFilter,
  TrafficSeriesKey,
} from '../types'

export const ALLOWED_DAYS: readonly DashboardQuery['days'][] = [7, 30, 90, 365]
export const ALLOWED_CHANNELS: readonly ChannelFilter[] = ['stable', 'all']
export const ALLOWED_SCOPES: readonly ScopeFilter[] = ['installers', 'distribution', 'all']
export const ALLOWED_TRAFFIC_SERIES: readonly TrafficSeriesKey[] = [
  'viewsCount',
  'viewsUniques',
  'clonesCount',
  'clonesUniques',
]

export const DEFAULT_QUERY: DashboardQuery = {
  days: 30,
  channel: 'stable',
  scope: 'installers',
}

const allowedDays = new Set<number>(ALLOWED_DAYS)
const allowedChannels = new Set<string>(ALLOWED_CHANNELS)
const allowedScopes = new Set<string>(ALLOWED_SCOPES)

/**
 * Strict parse for the API: an out-of-range value is a client error rather than
 * something to silently correct, so callers can answer with a 400.
 */
export function parseDashboardQuery(url: URL): DashboardQuery | null {
  const days = Number(url.searchParams.get('days') ?? String(DEFAULT_QUERY.days))
  const channel = url.searchParams.get('channel') ?? DEFAULT_QUERY.channel
  const scope = url.searchParams.get('scope') ?? DEFAULT_QUERY.scope

  if (!allowedDays.has(days) || !allowedChannels.has(channel) || !allowedScopes.has(scope)) {
    return null
  }

  return {
    days: days as DashboardQuery['days'],
    channel: channel as ChannelFilter,
    scope: scope as ScopeFilter,
  }
}

/**
 * Forgiving parse for the HTML page: a hand-edited or stale link should still
 * render a dashboard, so unknown values fall back to the defaults.
 */
export function coerceDashboardQuery(url: URL): DashboardPageQuery {
  const days = Number(url.searchParams.get('days'))
  const channel = url.searchParams.get('channel') ?? ''
  const scope = url.searchParams.get('scope') ?? ''

  const requestedTraffic = url.searchParams
    .getAll('traffic')
    .flatMap((value) => value.split(','))
    .filter((value) => value.length > 0)
  const recognizedTraffic = ALLOWED_TRAFFIC_SERIES.filter((key) => requestedTraffic.includes(key))
  const hasOnlyUnknownTraffic = requestedTraffic.length > 0 && recognizedTraffic.length === 0
  const traffic =
    url.searchParams.has('traffic') && !hasOnlyUnknownTraffic ? recognizedTraffic : undefined

  return {
    days: allowedDays.has(days) ? (days as DashboardQuery['days']) : DEFAULT_QUERY.days,
    channel: allowedChannels.has(channel) ? (channel as ChannelFilter) : DEFAULT_QUERY.channel,
    scope: allowedScopes.has(scope) ? (scope as ScopeFilter) : DEFAULT_QUERY.scope,
    ...(traffic === undefined ? {} : { traffic }),
  }
}

/**
 * Canonical link for a dashboard view. Filter links override one dimension;
 * the Traffic selector carries its checked series as repeated query values.
 * This keeps the dashboard server-rendered with no client-side script.
 */
export function dashboardHref(
  query: DashboardPageQuery,
  override: Partial<DashboardPageQuery> = {},
): string {
  const merged = { ...query, ...override }
  const params = new URLSearchParams({
    days: String(merged.days),
    channel: merged.channel,
    scope: merged.scope,
  })
  if (merged.traffic !== undefined) {
    if (merged.traffic.length === 0) params.append('traffic', '')
    else for (const key of merged.traffic) params.append('traffic', key)
  }
  return `/?${params.toString()}`
}

/**
 * The page itself is cached for five minutes, so the refresh form needs a
 * distinct URL to reach the origin again. Keep this nonce in a form field
 * rather than a crawlable link so search engines do not discover an endless
 * sequence of unique refresh URLs. The Worker treats it as opaque and never
 * feeds it into the dashboard query.
 */
export const CACHE_BUST_PARAM = 't'
