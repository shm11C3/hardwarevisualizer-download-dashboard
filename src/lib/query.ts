import type { ChannelFilter, DashboardQuery, ScopeFilter } from '../types'

export const ALLOWED_DAYS: readonly DashboardQuery['days'][] = [7, 30, 90, 365]
export const ALLOWED_CHANNELS: readonly ChannelFilter[] = ['stable', 'all']
export const ALLOWED_SCOPES: readonly ScopeFilter[] = ['installers', 'distribution', 'all']

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
export function coerceDashboardQuery(url: URL): DashboardQuery {
  const days = Number(url.searchParams.get('days'))
  const channel = url.searchParams.get('channel') ?? ''
  const scope = url.searchParams.get('scope') ?? ''

  return {
    days: allowedDays.has(days) ? (days as DashboardQuery['days']) : DEFAULT_QUERY.days,
    channel: allowedChannels.has(channel) ? (channel as ChannelFilter) : DEFAULT_QUERY.channel,
    scope: allowedScopes.has(scope) ? (scope as ScopeFilter) : DEFAULT_QUERY.scope,
  }
}

/**
 * Canonical link for a dashboard view. Every filter control renders one of
 * these with a single dimension overridden, which is what lets the page work
 * as plain navigation with no client-side script.
 */
export function dashboardHref(
  query: DashboardQuery,
  override: Partial<DashboardQuery> = {},
): string {
  const merged = { ...query, ...override }
  const params = new URLSearchParams({
    days: String(merged.days),
    channel: merged.channel,
    scope: merged.scope,
  })
  return `/?${params.toString()}`
}

/**
 * The page itself is cached for five minutes, so the refresh control needs a
 * distinct URL to reach the origin again. The Worker treats this parameter as
 * opaque: it never feeds the query and is never echoed back into a link, so a
 * refreshed page always hands out a freshly minted value.
 */
export const CACHE_BUST_PARAM = 't'

export function refreshHref(query: DashboardQuery, nonce: number): string {
  return `${dashboardHref(query)}&${CACHE_BUST_PARAM}=${nonce}`
}
