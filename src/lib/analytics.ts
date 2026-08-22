import type {
  AdoptionCurve,
  Architecture,
  AssetBreakdownItem,
  BreakdownItem,
  CollectionRunSummary,
  DashboardInsight,
  DashboardQuery,
  DashboardResponse,
  EmptyDashboardResponse,
  Platform,
  PlatformSeriesItem,
  ReleaseBreakdownItem,
  ReleaseEvent,
  RepoStats,
  SeriesPoint,
  UpdateHealth,
} from '../types'
import { architectureLabel, platformLabel } from './assets'
import { addDays, daysBetween, enumerateDates, laterDate, toDateKey } from './date'

export interface DailyTotalRow {
  date: string
  total: number
}

export interface RepoStatRow {
  date: string
  stargazers: number | null
  forks: number | null
  viewsCount: number | null
  viewsUniques: number | null
  clonesCount: number | null
  clonesUniques: number | null
}

export interface PeriodAnalytics {
  trackingSince: string
  latestSnapshotDate: string
  requestedStartDate: string
  effectiveBaselineDate: string
  totalDownloads: number
  periodDownloads: number
  previousPeriodDownloads: number | null
  growthPercent: number | null
  averagePerDay: number
  latestDayDownloads: number | null
  latestDayDate: string | null
  observedSnapshots: number
  expectedSnapshots: number
  completeness: number
  series: SeriesPoint[]
}

interface RunRow {
  started_at: string
  finished_at: string | null
  status: CollectionRunSummary['status']
  fetched_releases: number
  fetched_assets: number
  duration_ms: number | null
}

interface PlatformRow {
  key: string
  downloads: number
  total_downloads: number
}

export interface ArchitectureBreakdownRow {
  key: string
  downloads: number
  total_downloads: number
}

export interface PlatformTotalRow {
  date: string
  platform: Platform
  total: number
}

export interface ReleaseEventRow {
  tag: string
  label: string
  publishedAt: string
  prerelease: boolean
  url: string
}

interface ReleaseRow extends PlatformRow {
  label: string
  published_at: string
  prerelease: number
  url: string
}

interface AssetRow {
  id: number
  name: string
  tag: string
  platform: AssetBreakdownItem['platform']
  architecture: AssetBreakdownItem['architecture']
  kind: AssetBreakdownItem['kind']
  url: string
  downloads: number
  total_downloads: number
}

interface KindDailyRow {
  date: string
  installer_total: number
  updater_total: number
}

export interface LatestVersionRow {
  tag: string
  publishedAt: string
  downloads: number
}

export interface LatestVersionMetrics {
  latestVersionShare: number | null
  latestVersionTag: string | null
  latestVersionPublishedAt: string | null
}

export interface AdoptionCurveRow {
  tag: string
  label: string
  published_at: string
  url: string
  date: string
  downloads: number
}

export interface WeekdayAverage {
  key: number
  label: string
  average: number
  observations: number
}

export interface MilestoneRecord {
  reached: number
  reachedAt: string | null
  next: number
  remaining: number
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const

export function calculateWeekdayAverages(series: SeriesPoint[]): WeekdayAverage[] {
  const totals = WEEKDAY_LABELS.map(() => ({ total: 0, observations: 0 }))

  for (const point of series) {
    if (point.dailyDownloads === null) continue
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(point.date)
    if (!match) continue
    const weekday = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    ).getUTCDay()
    const bucket = totals[weekday]
    if (!bucket) continue
    bucket.total += point.dailyDownloads
    bucket.observations += 1
  }

  return [1, 2, 3, 4, 5, 6, 0].map((key) => {
    const bucket = totals[key] ?? { total: 0, observations: 0 }
    return {
      key,
      label: WEEKDAY_LABELS[key] ?? '',
      average: bucket.observations === 0 ? 0 : round(bucket.total / bucket.observations, 2),
      observations: bucket.observations,
    }
  })
}

function milestoneAtOrBelow(total: number): number {
  if (total <= 0) return 0
  const magnitude = 10 ** Math.floor(Math.log10(total))
  return total >= magnitude * 5 ? magnitude * 5 : magnitude
}

export function calculateMilestone(series: SeriesPoint[]): MilestoneRecord {
  const current = Math.max(0, series.at(-1)?.totalDownloads ?? 0)
  const reached = milestoneAtOrBelow(current)
  const magnitude = reached === 0 ? 1 : 10 ** Math.floor(Math.log10(reached))
  const next = reached === 0 ? 1 : reached === magnitude ? reached * 5 : reached * 2
  const reachedAt =
    reached === 0
      ? null
      : (series.find(
          (point, index) =>
            index > 0 &&
            (series[index - 1]?.totalDownloads ?? reached) < reached &&
            point.totalDownloads >= reached,
        )?.date ?? null)

  return { reached, reachedAt, next, remaining: Math.max(0, next - current) }
}

export function calculateObservationStreak(series: SeriesPoint[]): number {
  let streak = 0
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (!series[index]?.observed) break
    streak += 1
  }
  return streak
}

function numberValue(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function round(value: number, digits = 1): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function normalizeRows(rows: DailyTotalRow[]): DailyTotalRow[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    totals.set(row.date, Math.max(0, numberValue(row.total)))
  }

  return [...totals.entries()]
    .map(([date, total]) => ({ date, total }))
    .sort((left, right) => left.date.localeCompare(right.date))
}

function findLastOnOrBefore(rows: DailyTotalRow[], date: string): DailyTotalRow | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (row && row.date <= date) {
      return row
    }
  }
  return null
}

export function buildPlatformSeries(
  inputRows: PlatformTotalRow[],
  startDate: string,
  endDate: string,
): PlatformSeriesItem[] {
  const dates = enumerateDates(startDate, endDate)
  const platforms = [...new Set(inputRows.map((row) => row.platform))].sort()

  return platforms.map((platform) => {
    const totals = new Map(
      inputRows
        .filter((row) => row.platform === platform)
        .map((row) => [row.date, Math.max(0, numberValue(row.total))]),
    )
    return {
      key: platform,
      label: platformLabel(platform),
      points: dates.map((date) => {
        const current = totals.get(date)
        const previous = totals.get(addDays(date, -1))
        return {
          date,
          dailyDownloads:
            current === undefined || previous === undefined
              ? null
              : Math.max(0, current - previous),
        }
      }),
    }
  })
}

export function buildDailySeries(
  inputRows: DailyTotalRow[],
  startDate: string,
  endDate: string,
): SeriesPoint[] {
  const rows = normalizeRows(inputRows)
  const observed = new Map(rows.map((row) => [row.date, row.total]))
  let carriedTotal = findLastOnOrBefore(rows, startDate)?.total ?? 0

  return enumerateDates(startDate, endDate).map((date) => {
    const currentObserved = observed.get(date)
    const isObserved = currentObserved !== undefined
    if (isObserved) carriedTotal = currentObserved
    const previousObserved = observed.get(addDays(date, -1))

    return {
      date,
      totalDownloads: carriedTotal,
      dailyDownloads:
        isObserved && previousObserved !== undefined
          ? Math.max(0, carriedTotal - previousObserved)
          : null,
      observed: isObserved,
    }
  })
}

export function buildRepoStats(
  inputRows: RepoStatRow[],
  startDate: string,
  endDate: string,
): RepoStats {
  const rows = inputRows
    .map((row) => ({
      ...row,
      stargazers: nullableNumber(row.stargazers),
      forks: nullableNumber(row.forks),
      viewsCount: nullableNumber(row.viewsCount),
      viewsUniques: nullableNumber(row.viewsUniques),
      clonesCount: nullableNumber(row.clonesCount),
      clonesUniques: nullableNumber(row.clonesUniques),
    }))
    .sort((left, right) => left.date.localeCompare(right.date))
  const starRows = rows.filter(
    (row): row is typeof row & { stargazers: number } =>
      row.stargazers !== null && row.date <= endDate,
  )

  return {
    stars: {
      latest: starRows.at(-1)?.stargazers ?? null,
      series: starRows
        .map((row, index) => {
          const previous = starRows[index - 1]
          return {
            date: row.date,
            stargazers: row.stargazers,
            dailyDelta:
              previous && previous.date === addDays(row.date, -1)
                ? row.stargazers - previous.stargazers
                : null,
          }
        })
        .filter((point) => point.date >= startDate),
    },
    traffic: rows
      .filter(
        (row) =>
          row.date >= startDate &&
          row.date <= endDate &&
          (row.viewsCount !== null ||
            row.viewsUniques !== null ||
            row.clonesCount !== null ||
            row.clonesUniques !== null),
      )
      .map((row) => ({
        date: row.date,
        viewsCount: row.viewsCount,
        viewsUniques: row.viewsUniques,
        clonesCount: row.clonesCount,
        clonesUniques: row.clonesUniques,
      })),
  }
}

export function selectReleaseEvents(
  rows: ReleaseEventRow[],
  startDate: string,
  endDate: string,
  timeZone: string,
  channel: DashboardQuery['channel'],
): ReleaseEvent[] {
  const events = new Map<string, ReleaseEvent>()
  for (const row of rows) {
    if (channel === 'stable' && row.prerelease) continue
    const published = new Date(row.publishedAt)
    if (Number.isNaN(published.getTime())) continue
    const date = toDateKey(published, timeZone)
    if (date < startDate || date > endDate || events.has(row.tag)) continue
    events.set(row.tag, {
      tag: row.tag,
      label: row.label,
      prerelease: row.prerelease,
      url: row.url,
      date,
    })
  }
  return [...events.values()].sort(
    (left, right) => left.date.localeCompare(right.date) || left.tag.localeCompare(right.tag),
  )
}

export function buildLatestVersionMetrics(
  rows: LatestVersionRow[],
  periodDownloads: number,
): LatestVersionMetrics {
  const latest = [...rows].sort((left, right) => {
    const byDate = right.publishedAt.localeCompare(left.publishedAt)
    return byDate || left.tag.localeCompare(right.tag)
  })[0]

  return {
    latestVersionShare:
      latest && periodDownloads > 0
        ? round(Math.min(1, Math.max(0, latest.downloads / periodDownloads)), 4)
        : null,
    latestVersionTag: latest?.tag ?? null,
    latestVersionPublishedAt: latest?.publishedAt ?? null,
  }
}

export function buildPeriodAnalytics(
  inputRows: DailyTotalRow[],
  days: DashboardQuery['days'],
): PeriodAnalytics | null {
  const rows = normalizeRows(inputRows)
  const first = rows[0]
  const latest = rows.at(-1)
  if (!first || !latest) {
    return null
  }

  const requestedStartDate = addDays(latest.date, -(days - 1))
  const requestedBaseline = findLastOnOrBefore(rows, addDays(requestedStartDate, -1))
  const baseline = requestedBaseline ?? first
  const seriesStart = laterDate(requestedStartDate, baseline.date)
  const series = buildDailySeries(rows, seriesStart, latest.date)
  const observed = new Map(rows.map((row) => [row.date, row.total]))

  const periodDownloads = Math.max(0, latest.total - baseline.total)
  const elapsedDays = Math.max(0, daysBetween(baseline.date, latest.date))
  const averagePerDay = elapsedDays === 0 ? 0 : periodDownloads / elapsedDays

  const previousStart = addDays(requestedStartDate, -days)
  const previousEnd = addDays(requestedStartDate, -1)
  const previousBaseline = findLastOnOrBefore(rows, addDays(previousStart, -1))
  const previousLatest = findLastOnOrBefore(rows, previousEnd)
  const hasComparableCurrentWindow = requestedBaseline !== null
  const hasComparablePreviousWindow =
    previousBaseline !== null &&
    previousLatest !== null &&
    previousLatest.date >= previousStart &&
    daysBetween(previousBaseline.date, previousLatest.date) > 0

  const previousPeriodDownloads =
    hasComparableCurrentWindow && hasComparablePreviousWindow
      ? Math.max(0, previousLatest.total - previousBaseline.total)
      : null

  const growthPercent =
    previousPeriodDownloads !== null && previousPeriodDownloads > 0
      ? round(((periodDownloads - previousPeriodDownloads) / previousPeriodDownloads) * 100)
      : null

  const latestDayDownloads = observed.has(addDays(latest.date, -1))
    ? Math.max(0, latest.total - (observed.get(addDays(latest.date, -1)) ?? latest.total))
    : null

  const expectedSnapshots = daysBetween(baseline.date, latest.date) + 1
  const observedSnapshots = rows.filter(
    (row) => row.date >= baseline.date && row.date <= latest.date,
  ).length

  return {
    trackingSince: first.date,
    latestSnapshotDate: latest.date,
    requestedStartDate,
    effectiveBaselineDate: baseline.date,
    totalDownloads: latest.total,
    periodDownloads,
    previousPeriodDownloads,
    growthPercent,
    averagePerDay: round(averagePerDay, 2),
    latestDayDownloads,
    latestDayDate: latestDayDownloads === null ? null : latest.date,
    observedSnapshots,
    expectedSnapshots,
    completeness: expectedSnapshots === 0 ? 0 : round(observedSnapshots / expectedSnapshots, 4),
    series,
  }
}

function filterClause(query: DashboardQuery): string {
  const conditions = ['r.draft = 0']

  if (query.channel === 'stable') {
    conditions.push('r.prerelease = 0')
  }

  if (query.scope === 'installers') {
    conditions.push("a.kind = 'installer'")
  } else if (query.scope === 'distribution') {
    conditions.push("a.kind IN ('installer', 'updater', 'archive')")
  }

  return conditions.join(' AND ')
}

export function buildAdoptionCurves(
  inputRows: AdoptionCurveRow[],
  trackingSince: string,
  timeZone: string,
): AdoptionCurve[] {
  const releases = new Map<string, Omit<AdoptionCurve, 'points'> & { publishedDate: string }>()
  for (const row of inputRows) {
    const publishedDate = toDateKey(new Date(row.published_at), timeZone)
    const current = releases.get(row.tag)
    if (!current || row.published_at < current.publishedAt) {
      releases.set(row.tag, {
        tag: row.tag,
        label: row.label,
        publishedAt: row.published_at,
        publishedDate,
        url: row.url,
      })
    }
  }

  return [...releases.values()]
    .filter((release) => release.publishedDate >= trackingSince)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
    .slice(0, 5)
    .map((release) => ({
      tag: release.tag,
      label: release.label,
      publishedAt: release.publishedAt,
      url: release.url,
      points: inputRows
        .filter((row) => row.tag === release.tag)
        .map((row) => ({
          day: daysBetween(release.publishedDate, row.date),
          downloads: Math.max(0, numberValue(row.downloads)),
        }))
        .filter((point) => point.day >= 0 && point.day <= 30)
        .sort((left, right) => left.day - right.day),
    }))
}

async function adoptionCurveRows(
  database: D1Database,
  query: DashboardQuery,
): Promise<AdoptionCurveRow[]> {
  const result = await database
    .prepare(
      `
        WITH recent_tags AS (
          SELECT
            r.tag_name AS tag,
            COALESCE(NULLIF(MAX(r.name), ''), r.tag_name) AS label,
            MIN(r.published_at) AS published_at,
            MAX(r.html_url) AS url
          FROM releases r
          INNER JOIN assets a ON a.release_id = r.id
          WHERE ${filterClause(query)}
          GROUP BY r.tag_name
          ORDER BY published_at DESC
          LIMIT 5
        )
        SELECT
          recent_tags.tag,
          recent_tags.label,
          recent_tags.published_at,
          recent_tags.url,
          s.snapshot_date AS date,
          SUM(s.download_count) AS downloads
        FROM recent_tags
        INNER JOIN releases r ON r.tag_name = recent_tags.tag
        INNER JOIN assets a ON a.release_id = r.id
        INNER JOIN snapshots s ON s.asset_id = a.id
        WHERE ${filterClause(query)}
        GROUP BY recent_tags.tag, s.snapshot_date
        ORDER BY recent_tags.published_at DESC, s.snapshot_date ASC
      `,
    )
    .all<AdoptionCurveRow>()

  return (result.results ?? []).map((row) => ({ ...row, downloads: numberValue(row.downloads) }))
}

async function lastCollection(database: D1Database): Promise<CollectionRunSummary | null> {
  const row = await database
    .prepare(
      `
        SELECT started_at, finished_at, status, fetched_releases, fetched_assets, duration_ms
        FROM collection_runs
        ORDER BY started_at DESC
        LIMIT 1
      `,
    )
    .first<RunRow>()

  if (!row) {
    return null
  }

  return {
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    fetchedReleases: numberValue(row.fetched_releases),
    fetchedAssets: numberValue(row.fetched_assets),
    durationMs: row.duration_ms === null ? null : numberValue(row.duration_ms),
  }
}

async function dailyTotals(database: D1Database, query: DashboardQuery): Promise<DailyTotalRow[]> {
  const result = await database
    .prepare(
      `
        SELECT s.snapshot_date AS date, SUM(s.download_count) AS total
        FROM snapshots s
        INNER JOIN assets a ON a.id = s.asset_id
        INNER JOIN releases r ON r.id = a.release_id
        WHERE ${filterClause(query)}
        GROUP BY s.snapshot_date
        ORDER BY s.snapshot_date ASC
      `,
    )
    .all<DailyTotalRow>()

  return (result.results ?? []).map((row) => ({
    date: row.date,
    total: numberValue(row.total),
  }))
}

async function repositoryStats(
  database: D1Database,
  startDate: string,
  endDate: string,
): Promise<RepoStats> {
  const result = await database
    .prepare(
      `
        SELECT
          stat_date AS date,
          stargazers,
          forks,
          views_count AS viewsCount,
          views_uniques AS viewsUniques,
          clones_count AS clonesCount,
          clones_uniques AS clonesUniques
        FROM repo_stats
        WHERE stat_date <= ?
        ORDER BY stat_date ASC
      `,
    )
    .bind(endDate)
    .all<RepoStatRow>()

  return buildRepoStats(result.results ?? [], startDate, endDate)
}

async function platformTotals(
  database: D1Database,
  query: DashboardQuery,
  startDate: string,
  endDate: string,
): Promise<PlatformTotalRow[]> {
  const result = await database
    .prepare(
      `
        SELECT s.snapshot_date AS date, a.platform, SUM(s.download_count) AS total
        FROM snapshots s
        INNER JOIN assets a ON a.id = s.asset_id
        INNER JOIN releases r ON r.id = a.release_id
        WHERE ${filterClause(query)} AND s.snapshot_date BETWEEN ? AND ?
        GROUP BY s.snapshot_date, a.platform
        ORDER BY s.snapshot_date ASC, a.platform ASC
      `,
    )
    .bind(startDate, endDate)
    .all<PlatformTotalRow>()

  return (result.results ?? []).map((row) => ({ ...row, total: numberValue(row.total) }))
}

async function releaseEvents(
  database: D1Database,
  startDate: string,
  endDate: string,
  timeZone: string,
  channel: DashboardQuery['channel'],
): Promise<ReleaseEvent[]> {
  const result = await database
    .prepare(
      `
        SELECT
          tag_name AS tag,
          COALESCE(NULLIF(MAX(name), ''), tag_name) AS label,
          MIN(published_at) AS publishedAt,
          MAX(prerelease) AS prerelease,
          MAX(html_url) AS url
        FROM releases
        WHERE draft = 0
        GROUP BY tag_name
        ORDER BY publishedAt ASC
      `,
    )
    .all<{ tag: string; label: string; publishedAt: string; prerelease: number; url: string }>()

  return selectReleaseEvents(
    (result.results ?? []).map((row) => ({ ...row, prerelease: Boolean(row.prerelease) })),
    startDate,
    endDate,
    timeZone,
    channel,
  )
}

async function updateHealth(
  database: D1Database,
  query: DashboardQuery,
  startDate: string,
  endDate: string,
  baselineDate: string,
): Promise<UpdateHealth> {
  const channelClause = query.channel === 'stable' ? 'AND r.prerelease = 0' : ''
  const result = await database
    .prepare(
      `
        SELECT
          s.snapshot_date AS date,
          SUM(CASE WHEN a.kind = 'installer' THEN s.download_count ELSE 0 END) AS installer_total,
          SUM(CASE WHEN a.kind = 'updater' THEN s.download_count ELSE 0 END) AS updater_total
        FROM snapshots s
        INNER JOIN assets a ON a.id = s.asset_id
        INNER JOIN releases r ON r.id = a.release_id
        WHERE r.draft = 0
          ${channelClause}
          AND a.kind IN ('installer', 'updater')
          AND s.snapshot_date >= ?
          AND s.snapshot_date <= ?
        GROUP BY s.snapshot_date
        ORDER BY s.snapshot_date ASC
      `,
    )
    .bind(baselineDate, endDate)
    .all<KindDailyRow>()

  const rows = result.results ?? []
  const installerRows = rows.map((row) => ({ date: row.date, total: row.installer_total }))
  const updaterRows = rows.map((row) => ({ date: row.date, total: row.updater_total }))
  const periodTotal = (kindRows: DailyTotalRow[]) => {
    const normalized = normalizeRows(kindRows)
    const baseline = findLastOnOrBefore(normalized, baselineDate)?.total ?? 0
    const latest = findLastOnOrBefore(normalized, endDate)?.total ?? baseline
    return Math.max(0, latest - baseline)
  }

  return {
    installer: {
      periodDownloads: periodTotal(installerRows),
      series: buildDailySeries(installerRows, startDate, endDate),
    },
    updater: {
      periodDownloads: periodTotal(updaterRows),
      series: buildDailySeries(updaterRows, startDate, endDate),
    },
  }
}

async function latestVersionRows(
  database: D1Database,
  query: DashboardQuery,
  currentDate: string,
  baselineDate: string,
): Promise<LatestVersionRow[]> {
  const releaseChannelClause = query.channel === 'stable' ? 'AND prerelease = 0' : ''
  const assetScopeClause =
    query.scope === 'installers'
      ? "AND a.kind = 'installer'"
      : query.scope === 'distribution'
        ? "AND a.kind IN ('installer', 'updater', 'archive')"
        : ''
  const result = await database
    .prepare(
      `
        WITH latest_tag AS (
          SELECT tag_name AS tag, MAX(published_at) AS publishedAt
          FROM releases
          WHERE draft = 0
            ${releaseChannelClause}
            AND published_at IS NOT NULL
          GROUP BY tag_name
          ORDER BY publishedAt DESC, tag ASC
          LIMIT 1
        ), current_snapshot AS (
          SELECT asset_id, download_count FROM snapshots WHERE snapshot_date = ?
        ), baseline_snapshot AS (
          SELECT asset_id, download_count FROM snapshots WHERE snapshot_date = ?
        )
        SELECT
          latest_tag.tag,
          latest_tag.publishedAt,
          SUM(
            CASE
              WHEN current_snapshot.download_count > COALESCE(baseline_snapshot.download_count, 0)
              THEN current_snapshot.download_count - COALESCE(baseline_snapshot.download_count, 0)
              ELSE 0
            END
          ) AS downloads
        FROM latest_tag
        INNER JOIN releases r ON r.tag_name = latest_tag.tag
          AND r.draft = 0
          ${query.channel === 'stable' ? 'AND r.prerelease = 0' : ''}
        LEFT JOIN assets a ON a.release_id = r.id
          ${assetScopeClause}
        LEFT JOIN current_snapshot ON current_snapshot.asset_id = a.id
        LEFT JOIN baseline_snapshot ON baseline_snapshot.asset_id = a.id
        GROUP BY latest_tag.tag, latest_tag.publishedAt
      `,
    )
    .bind(currentDate, baselineDate)
    .all<{ tag: string; publishedAt: string; downloads: number }>()

  return (result.results ?? []).map((row) => ({
    tag: row.tag,
    publishedAt: row.publishedAt,
    downloads: numberValue(row.downloads),
  }))
}

function share(
  downloads: number,
  periodDownloads: number,
  currentItemTotal: number,
  currentTotal: number,
): number {
  if (periodDownloads > 0) {
    return round(downloads / periodDownloads, 4)
  }
  return currentTotal > 0 ? round(currentItemTotal / currentTotal, 4) : 0
}

async function platformBreakdown(
  database: D1Database,
  query: DashboardQuery,
  currentDate: string,
  baselineDate: string,
  periodDownloads: number,
  totalDownloads: number,
): Promise<BreakdownItem[]> {
  const result = await database
    .prepare(
      `
        WITH current_snapshot AS (
          SELECT asset_id, download_count
          FROM snapshots
          WHERE snapshot_date = ?
        ), baseline_snapshot AS (
          SELECT asset_id, download_count
          FROM snapshots
          WHERE snapshot_date = ?
        )
        SELECT
          a.platform AS key,
          SUM(current_snapshot.download_count) AS total_downloads,
          SUM(
            CASE
              WHEN current_snapshot.download_count > COALESCE(baseline_snapshot.download_count, 0)
              THEN current_snapshot.download_count - COALESCE(baseline_snapshot.download_count, 0)
              ELSE 0
            END
          ) AS downloads
        FROM current_snapshot
        INNER JOIN assets a ON a.id = current_snapshot.asset_id
        INNER JOIN releases r ON r.id = a.release_id
        LEFT JOIN baseline_snapshot ON baseline_snapshot.asset_id = current_snapshot.asset_id
        WHERE ${filterClause(query)}
        GROUP BY a.platform
        ORDER BY downloads DESC, total_downloads DESC
      `,
    )
    .bind(currentDate, baselineDate)
    .all<PlatformRow>()

  return (result.results ?? []).map((row) => {
    const downloads = numberValue(row.downloads)
    const currentTotal = numberValue(row.total_downloads)
    return {
      key: row.key,
      label: platformLabel(row.key as Platform),
      downloads,
      totalDownloads: currentTotal,
      share: share(downloads, periodDownloads, currentTotal, totalDownloads),
    }
  })
}

export function buildArchitectureBreakdown(
  rows: ArchitectureBreakdownRow[],
  periodDownloads: number,
  totalDownloads: number,
): BreakdownItem[] {
  return rows.map((row) => {
    const downloads = numberValue(row.downloads)
    const currentTotal = numberValue(row.total_downloads)
    return {
      key: row.key,
      label: architectureLabel(row.key as Architecture),
      downloads,
      totalDownloads: currentTotal,
      share: share(downloads, periodDownloads, currentTotal, totalDownloads),
    }
  })
}

async function architectureBreakdown(
  database: D1Database,
  query: DashboardQuery,
  currentDate: string,
  baselineDate: string,
  periodDownloads: number,
  totalDownloads: number,
): Promise<BreakdownItem[]> {
  const result = await database
    .prepare(
      `
        WITH current_snapshot AS (
          SELECT asset_id, download_count
          FROM snapshots
          WHERE snapshot_date = ?
        ), baseline_snapshot AS (
          SELECT asset_id, download_count
          FROM snapshots
          WHERE snapshot_date = ?
        )
        SELECT
          a.architecture AS key,
          SUM(current_snapshot.download_count) AS total_downloads,
          SUM(
            CASE
              WHEN current_snapshot.download_count > COALESCE(baseline_snapshot.download_count, 0)
              THEN current_snapshot.download_count - COALESCE(baseline_snapshot.download_count, 0)
              ELSE 0
            END
          ) AS downloads
        FROM current_snapshot
        INNER JOIN assets a ON a.id = current_snapshot.asset_id
        INNER JOIN releases r ON r.id = a.release_id
        LEFT JOIN baseline_snapshot ON baseline_snapshot.asset_id = current_snapshot.asset_id
        WHERE ${filterClause(query)}
        GROUP BY a.architecture
        ORDER BY downloads DESC, total_downloads DESC
      `,
    )
    .bind(currentDate, baselineDate)
    .all<ArchitectureBreakdownRow>()

  return buildArchitectureBreakdown(result.results ?? [], periodDownloads, totalDownloads)
}

async function releaseBreakdown(
  database: D1Database,
  query: DashboardQuery,
  currentDate: string,
  baselineDate: string,
  periodDownloads: number,
  totalDownloads: number,
): Promise<ReleaseBreakdownItem[]> {
  const result = await database
    .prepare(
      `
        WITH current_snapshot AS (
          SELECT asset_id, download_count
          FROM snapshots
          WHERE snapshot_date = ?
        ), baseline_snapshot AS (
          SELECT asset_id, download_count
          FROM snapshots
          WHERE snapshot_date = ?
        )
        SELECT
          r.tag_name AS key,
          COALESCE(NULLIF(MAX(r.name), ''), r.tag_name) AS label,
          MIN(r.published_at) AS published_at,
          MAX(r.prerelease) AS prerelease,
          MAX(r.html_url) AS url,
          SUM(current_snapshot.download_count) AS total_downloads,
          SUM(
            CASE
              WHEN current_snapshot.download_count > COALESCE(baseline_snapshot.download_count, 0)
              THEN current_snapshot.download_count - COALESCE(baseline_snapshot.download_count, 0)
              ELSE 0
            END
          ) AS downloads
        FROM current_snapshot
        INNER JOIN assets a ON a.id = current_snapshot.asset_id
        INNER JOIN releases r ON r.id = a.release_id
        LEFT JOIN baseline_snapshot ON baseline_snapshot.asset_id = current_snapshot.asset_id
        WHERE ${filterClause(query)}
        GROUP BY r.tag_name
        ORDER BY downloads DESC, total_downloads DESC
        LIMIT 12
      `,
    )
    .bind(currentDate, baselineDate)
    .all<ReleaseRow>()

  return (result.results ?? []).map((row) => {
    const downloads = numberValue(row.downloads)
    const currentTotal = numberValue(row.total_downloads)
    return {
      key: row.key,
      label: row.label,
      publishedAt: row.published_at,
      prerelease: Boolean(row.prerelease),
      url: row.url,
      downloads,
      totalDownloads: currentTotal,
      share: share(downloads, periodDownloads, currentTotal, totalDownloads),
    }
  })
}

async function topAssets(
  database: D1Database,
  query: DashboardQuery,
  currentDate: string,
  baselineDate: string,
  periodDownloads: number,
  totalDownloads: number,
): Promise<AssetBreakdownItem[]> {
  const result = await database
    .prepare(
      `
        WITH current_snapshot AS (
          SELECT asset_id, download_count
          FROM snapshots
          WHERE snapshot_date = ?
        ), baseline_snapshot AS (
          SELECT asset_id, download_count
          FROM snapshots
          WHERE snapshot_date = ?
        )
        SELECT
          a.id,
          a.name,
          r.tag_name AS tag,
          a.platform,
          a.architecture,
          a.kind,
          a.browser_download_url AS url,
          current_snapshot.download_count AS total_downloads,
          CASE
            WHEN current_snapshot.download_count > COALESCE(baseline_snapshot.download_count, 0)
            THEN current_snapshot.download_count - COALESCE(baseline_snapshot.download_count, 0)
            ELSE 0
          END AS downloads
        FROM current_snapshot
        INNER JOIN assets a ON a.id = current_snapshot.asset_id
        INNER JOIN releases r ON r.id = a.release_id
        LEFT JOIN baseline_snapshot ON baseline_snapshot.asset_id = current_snapshot.asset_id
        WHERE ${filterClause(query)}
        ORDER BY downloads DESC, total_downloads DESC
        LIMIT 12
      `,
    )
    .bind(currentDate, baselineDate)
    .all<AssetRow>()

  return (result.results ?? []).map((row) => {
    const downloads = numberValue(row.downloads)
    const currentTotal = numberValue(row.total_downloads)
    return {
      id: numberValue(row.id),
      name: row.name,
      tag: row.tag,
      platform: row.platform,
      architecture: row.architecture,
      kind: row.kind,
      url: row.url,
      downloads,
      totalDownloads: currentTotal,
      share: share(downloads, periodDownloads, currentTotal, totalDownloads),
    }
  })
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(value)
}

function buildInsights(
  analytics: PeriodAnalytics,
  platforms: BreakdownItem[],
  releases: ReleaseBreakdownItem[],
  latestVersion: LatestVersionMetrics,
): DashboardInsight[] {
  const topPlatform = platforms[0]
  const topRelease = releases[0]
  const peak = analytics.series
    .filter(
      (point): point is SeriesPoint & { dailyDownloads: number } => point.dailyDownloads !== null,
    )
    .sort((left, right) => right.dailyDownloads - left.dailyDownloads)[0]
  const publishedDuringPeriod =
    latestVersion.latestVersionPublishedAt !== null &&
    latestVersion.latestVersionPublishedAt.slice(0, 10) >= analytics.requestedStartDate &&
    latestVersion.latestVersionPublishedAt.slice(0, 10) <= analytics.latestSnapshotDate
  const publicationNote = publishedDuringPeriod
    ? ` ${latestVersion.latestVersionTag ?? '最新バージョン'} は期間の途中で公開されています。`
    : ''
  const milestone = calculateMilestone(analytics.series)
  const observationStreak = calculateObservationStreak(analytics.series)

  let growthValue = '比較データなし'
  let growthBody = '同じ長さの直前期間が揃うと、増減率を表示します。'
  if (analytics.growthPercent !== null) {
    growthValue = `${analytics.growthPercent > 0 ? '+' : ''}${formatNumber(analytics.growthPercent)}%`
    growthBody = `前期間の ${formatNumber(analytics.previousPeriodDownloads ?? 0)} 件に対し、現在期間は ${formatNumber(analytics.periodDownloads)} 件です。`
  } else if (analytics.previousPeriodDownloads === 0 && analytics.periodDownloads > 0) {
    growthValue = '新規増加'
    growthBody = '前期間が 0 件のため、割合ではなく新規増加として扱っています。'
  }

  return [
    {
      kind: 'growth',
      title: '期間トレンド',
      value: growthValue,
      body: growthBody,
    },
    {
      kind: 'platform',
      title: '最多プラットフォーム',
      value: topPlatform?.label ?? 'データなし',
      body: topPlatform
        ? `期間内 ${formatNumber(topPlatform.downloads)} 件、構成比 ${formatNumber(topPlatform.share * 100)}% です。`
        : '対象条件に一致するプラットフォームがありません。',
    },
    {
      kind: 'release',
      title: '牽引リリース',
      value: topRelease?.key ?? 'データなし',
      body: topRelease
        ? `期間内 ${formatNumber(topRelease.downloads)} 件で、対象ダウンロードを最も牽引しています。`
        : '対象条件に一致するリリースがありません。',
    },
    {
      kind: 'latest',
      title: '最新バージョン比率',
      value:
        latestVersion.latestVersionShare === null
          ? '算出不可'
          : `${formatNumber(latestVersion.latestVersionShare * 100)}%`,
      body:
        latestVersion.latestVersionShare === null
          ? '期間内の対象ダウンロードがあると算出します。'
          : latestVersion.latestVersionShare < 0.5
            ? `${latestVersion.latestVersionTag ?? '最新バージョン'} の比率が低く、古いバージョンへの導線が残っている可能性があります。${publicationNote}`
            : `${latestVersion.latestVersionTag ?? '最新バージョン'} が期間内ダウンロードの中心です。${publicationNote}`,
    },
    {
      kind: 'peak',
      title: 'ピーク日',
      value: peak ? peak.date : '算出不可',
      body: peak
        ? `${formatNumber(peak.dailyDownloads)} 件を記録しました。欠損日をまたぐ差分はピーク判定から除外しています。`
        : '連続した日次スナップショットが揃うと算出します。',
    },
    {
      kind: 'data',
      title: 'データ完全性',
      value: `${formatNumber(analytics.completeness * 100)}%`,
      body: `${analytics.observedSnapshots} / ${analytics.expectedSnapshots} 日分のスナップショットを確認できました。`,
    },
    {
      kind: 'milestone',
      title: '累計マイルストーン',
      value: milestone.reached > 0 ? `${formatNumber(milestone.reached)} 件` : 'これから',
      body:
        milestone.reached > 0
          ? `${milestone.reachedAt ? `${milestone.reachedAt} に到達。` : '表示期間より前に到達。'}次の ${formatNumber(milestone.next)} 件まで残り ${formatNumber(milestone.remaining)} 件です。`
          : `最初の ${formatNumber(milestone.next)} 件まで残り ${formatNumber(milestone.remaining)} 件です。`,
    },
    {
      kind: 'streak',
      title: '観測ストリーク',
      value: `${formatNumber(observationStreak)} 日`,
      body:
        observationStreak > 0
          ? '最新日から連続してスナップショットを観測できています。'
          : '最新日のスナップショットを観測できていません。',
    },
  ]
}

export async function getDashboard(
  env: CloudflareBindings,
  query: DashboardQuery,
): Promise<DashboardResponse | EmptyDashboardResponse> {
  const owner = env.GITHUB_OWNER ?? 'shm11C3'
  const repo = env.GITHUB_REPO ?? 'HardwareVisualizer'
  const timeZone = env.TIME_ZONE ?? 'Asia/Tokyo'
  const generatedAt = new Date().toISOString()
  const collection = await lastCollection(env.DB)
  const totals = await dailyTotals(env.DB, query)
  const analytics = buildPeriodAnalytics(totals, query.days)

  if (!analytics) {
    return {
      status: 'empty',
      meta: {
        owner,
        repo,
        generatedAt,
        timeZone,
        days: query.days,
        channel: query.channel,
        scope: query.scope,
        lastCollection: collection,
      },
      message:
        'まだダウンロード履歴がありません。初回収集を実行すると、その時点を基準に日次差分の記録を開始します。',
    }
  }

  const [
    platforms,
    architectures,
    releases,
    assets,
    platformRows,
    events,
    health,
    versionRows,
    adoptionRows,
    repoStats,
  ] = await Promise.all([
    platformBreakdown(
      env.DB,
      query,
      analytics.latestSnapshotDate,
      analytics.effectiveBaselineDate,
      analytics.periodDownloads,
      analytics.totalDownloads,
    ),
    architectureBreakdown(
      env.DB,
      query,
      analytics.latestSnapshotDate,
      analytics.effectiveBaselineDate,
      analytics.periodDownloads,
      analytics.totalDownloads,
    ),
    releaseBreakdown(
      env.DB,
      query,
      analytics.latestSnapshotDate,
      analytics.effectiveBaselineDate,
      analytics.periodDownloads,
      analytics.totalDownloads,
    ),
    topAssets(
      env.DB,
      query,
      analytics.latestSnapshotDate,
      analytics.effectiveBaselineDate,
      analytics.periodDownloads,
      analytics.totalDownloads,
    ),
    platformTotals(env.DB, query, analytics.effectiveBaselineDate, analytics.latestSnapshotDate),
    releaseEvents(
      env.DB,
      analytics.series[0]?.date ?? analytics.latestSnapshotDate,
      analytics.latestSnapshotDate,
      timeZone,
      query.channel,
    ),
    updateHealth(
      env.DB,
      query,
      analytics.series[0]?.date ?? analytics.requestedStartDate,
      analytics.latestSnapshotDate,
      analytics.effectiveBaselineDate,
    ),
    latestVersionRows(env.DB, query, analytics.latestSnapshotDate, analytics.effectiveBaselineDate),
    adoptionCurveRows(env.DB, query),
    // Stars and traffic can predate download tracking, so use the requested
    // window start rather than the download series' clamped start.
    repositoryStats(env.DB, analytics.requestedStartDate, analytics.latestSnapshotDate),
  ])
  const latestVersion = buildLatestVersionMetrics(versionRows, analytics.periodDownloads)

  return {
    status: 'ok',
    meta: {
      owner,
      repo,
      generatedAt,
      latestSnapshotDate: analytics.latestSnapshotDate,
      trackingSince: analytics.trackingSince,
      requestedStartDate: analytics.requestedStartDate,
      effectiveBaselineDate: analytics.effectiveBaselineDate,
      timeZone,
      days: query.days,
      channel: query.channel,
      scope: query.scope,
      observedSnapshots: analytics.observedSnapshots,
      expectedSnapshots: analytics.expectedSnapshots,
      completeness: analytics.completeness,
      lastCollection: collection,
    },
    summary: {
      totalDownloads: analytics.totalDownloads,
      periodDownloads: analytics.periodDownloads,
      previousPeriodDownloads: analytics.previousPeriodDownloads,
      growthPercent: analytics.growthPercent,
      averagePerDay: analytics.averagePerDay,
      latestDayDownloads: analytics.latestDayDownloads,
      latestDayDate: analytics.latestDayDate,
    },
    repoStats,
    series: analytics.series,
    releaseEvents: events,
    platformSeries: buildPlatformSeries(
      platformRows,
      analytics.series[0]?.date ?? analytics.latestSnapshotDate,
      analytics.latestSnapshotDate,
    ),
    platformBreakdown: platforms,
    architectureBreakdown: architectures,
    releaseBreakdown: releases,
    adoptionCurves: buildAdoptionCurves(adoptionRows, analytics.trackingSince, timeZone),
    topAssets: assets,
    updateHealth: health,
    ...latestVersion,
    insights: buildInsights(analytics, platforms, releases, latestVersion),
  }
}
