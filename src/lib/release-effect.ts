import type {
  ChannelFilter,
  ReleaseEffect,
  ReleaseEffectDailyPoint,
  ReleaseEffectRelease,
} from '../types'
import type { DailyTotalRow, ReleaseEventRow } from './analytics'
import { addDays, daysBetween, toDateKey } from './date'

// Release-relative signals for the latest release, built only from cumulative
// download counts. Everything here is a proxy: installer downloads are
// distribution activity, not new users, and latest.json downloads are startup
// update checks, not unique active users.
//
// Windows are always compared by exact snapshot dates. A missing endpoint makes
// the metric null instead of falling back to a nearby snapshot, so a value is
// only shown when the release and its baseline were observed like for like.

/** Days of installer downloads before the publish date that form the baseline. */
export const BASELINE_DAYS = 7
/** Matches the adoption curve, which follows a release for 30 days. */
export const EVALUATION_WINDOW_DAYS = 30
const ACTIVITY_CHART_DAYS = 60
const FALLBACK_LOOKBACK_DAYS = 14

export interface TagTotalRow {
  tag: string
  date: string
  total: number
}

interface PlannedRelease extends ReleaseEffectRelease {
  publishedDate: string
}

export interface ReleaseEffectPlan {
  release: PlannedRelease
  previous: PlannedRelease | null
  /** Every release that could be compared, newest first. */
  releases: PlannedRelease[]
  day: number
  elapsedDays: number
  evaluatedDate: string
  /** Oldest snapshot date the metrics read, so queries can stay bounded. */
  fetchFrom: string
}

export interface ReleaseEffectData {
  trackingSince: string
  /** Cumulative installer downloads across every release. */
  installerTotals: DailyTotalRow[]
  /** Cumulative latest.json downloads across every release. */
  updateCheckTotals: DailyTotalRow[]
  /** Cumulative installer downloads of the latest and previous release. */
  tagTotals: TagTotalRow[]
}

function round(value: number, digits = 1): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function earlier(left: string, right: string): string {
  return left <= right ? left : right
}

function later(left: string, right: string): string {
  return left >= right ? left : right
}

function changePercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous <= 0) return null
  return round(((current - previous) / previous) * 100)
}

function totalsByDate(rows: DailyTotalRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.date, Math.max(0, Number(row.total) || 0)]))
}

function totalsByTag(rows: TagTotalRow[]): Map<string, Map<string, number>> {
  const tags = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const dates = tags.get(row.tag) ?? new Map<string, number>()
    dates.set(row.date, Math.max(0, Number(row.total) || 0))
    tags.set(row.tag, dates)
  }
  return tags
}

function dailyDeltas(
  totals: Map<string, number>,
  startDate: string,
  endDate: string,
): ReleaseEffectDailyPoint[] {
  const length = Math.max(0, daysBetween(startDate, endDate))
  return Array.from({ length }, (_, index) => {
    const date = addDays(startDate, index)
    const start = totals.get(date)
    const end = totals.get(addDays(date, 1))
    return {
      date,
      downloads: start === undefined || end === undefined ? null : Math.max(0, end - start),
    }
  })
}

/** Downloads per day across [startDate, endDate], or null unless both snapshots exist. */
function ratePerDay(
  totals: Map<string, number>,
  startDate: string,
  endDate: string,
): number | null {
  const days = daysBetween(startDate, endDate)
  const start = totals.get(startDate)
  const end = totals.get(endDate)
  if (days <= 0 || start === undefined || end === undefined) return null
  return Math.max(0, end - start) / days
}

function toRelease(row: ReleaseEventRow, publishedDate: string): PlannedRelease {
  return {
    tag: row.tag,
    label: row.label,
    publishedAt: row.publishedAt,
    prerelease: row.prerelease,
    url: row.url,
    publishedDate,
  }
}

/** Picks the release to evaluate and the one to compare it with. */
export function planReleaseEffect(
  rows: ReleaseEventRow[],
  channel: ChannelFilter,
  timeZone: string,
  latestSnapshotDate: string,
): ReleaseEffectPlan | null {
  const releases = new Map<string, PlannedRelease>()
  for (const row of rows) {
    if (channel === 'stable' && row.prerelease) continue
    const published = new Date(row.publishedAt)
    if (Number.isNaN(published.getTime())) continue
    const current = releases.get(row.tag)
    if (current && current.publishedAt <= row.publishedAt) continue
    releases.set(row.tag, toRelease(row, toDateKey(published, timeZone)))
  }

  const ordered = [...releases.values()].sort(
    (left, right) =>
      right.publishedAt.localeCompare(left.publishedAt) || left.tag.localeCompare(right.tag),
  )
  const release = ordered[0]
  if (!release) return null
  const previous = ordered[1] ?? null

  const elapsedDays = Math.max(0, daysBetween(release.publishedDate, latestSnapshotDate))
  const day = Math.min(elapsedDays, EVALUATION_WINDOW_DAYS)
  const baselineStart = addDays(release.publishedDate, -BASELINE_DAYS)
  const fetchFrom = earlier(
    baselineStart,
    previous?.publishedDate ?? addDays(release.publishedDate, -FALLBACK_LOOKBACK_DAYS),
  )

  return {
    release,
    previous,
    releases: ordered,
    day,
    elapsedDays,
    evaluatedDate: addDays(release.publishedDate, day),
    fetchFrom,
  }
}

export function buildReleaseEffect(
  plan: ReleaseEffectPlan,
  data: ReleaseEffectData,
): ReleaseEffect {
  const { release, previous, day, evaluatedDate } = plan
  const publishedDate = release.publishedDate
  const installer = totalsByDate(data.installerTotals)
  const checks = totalsByDate(data.updateCheckTotals)
  const tags = totalsByTag(data.tagTotals)
  const comparable = day >= 1

  // A cumulative count only means "since publish" when the release was first
  // observed after tracking began; otherwise it also holds earlier downloads.
  const cumulative = (tag: string, date: string): number | null => {
    const dates = tags.get(tag)
    if (!dates) return null
    const first = [...dates.keys()].sort()[0]
    if (first === undefined || first <= data.trackingSince) return null
    return dates.get(date) ?? null
  }

  const adoptionCurrent = comparable ? cumulative(release.tag, evaluatedDate) : null
  const adoptionPrevious =
    comparable && previous ? cumulative(previous.tag, addDays(previous.publishedDate, day)) : null

  // The release's own downloads on the publish date belong to the post-release
  // window even when a collection ran after it went out.
  const releaseAtPublish = tags.get(release.tag)?.get(publishedDate) ?? 0
  const installerAtPublish = installer.get(publishedDate)
  const othersAtPublish =
    installerAtPublish === undefined ? null : Math.max(0, installerAtPublish - releaseAtPublish)
  const baselineStart = addDays(publishedDate, -BASELINE_DAYS)
  // The bars split at the same boundary as the KPIs: the release's own downloads
  // already in the publish-date snapshot belong to the day it went out, not before.
  const chartTotals = new Map(installer)
  if (othersAtPublish !== null) chartTotals.set(publishedDate, othersAtPublish)
  const baselineStartTotal = installer.get(baselineStart)
  const evaluatedTotal = installer.get(evaluatedDate)

  const baselinePerDay =
    comparable && othersAtPublish !== null && baselineStartTotal !== undefined
      ? Math.max(0, othersAtPublish - baselineStartTotal) / BASELINE_DAYS
      : null
  const actual =
    comparable && othersAtPublish !== null && evaluatedTotal !== undefined
      ? Math.max(0, evaluatedTotal - othersAtPublish)
      : null
  const postPerDay = actual === null ? null : actual / day
  const expected = baselinePerDay === null ? null : Math.round(baselinePerDay * day)

  // Update checks are counted on whichever release is latest, so the previous
  // release's window must end before this one began. When the releases are closer
  // together than the evaluated day, both are compared over the shared days.
  const checkDays = previous
    ? Math.min(day, daysBetween(previous.publishedDate, publishedDate))
    : day
  const comparedDays = checkDays >= 1 ? checkDays : null
  const currentChecks =
    comparedDays === null
      ? null
      : ratePerDay(checks, publishedDate, addDays(publishedDate, comparedDays))
  const previousChecks =
    comparedDays === null || !previous
      ? null
      : ratePerDay(checks, previous.publishedDate, addDays(previous.publishedDate, comparedDays))

  const activityStart = later(
    previous?.publishedDate ?? addDays(publishedDate, -FALLBACK_LOOKBACK_DAYS),
    addDays(evaluatedDate, -ACTIVITY_CHART_DAYS),
  )

  return {
    release: toPublicRelease(release),
    previousRelease: previous ? toPublicRelease(previous) : null,
    day,
    elapsedDays: plan.elapsedDays,
    evaluatedDate,
    adoptionVelocity: {
      current: adoptionCurrent,
      previous: adoptionPrevious,
      changePercent: changePercent(adoptionCurrent, adoptionPrevious),
    },
    releaseLift: {
      baselinePerDay: baselinePerDay === null ? null : round(baselinePerDay),
      postPerDay: postPerDay === null ? null : round(postPerDay),
      multiple:
        baselinePerDay !== null && baselinePerDay > 0 && postPerDay !== null
          ? round(postPerDay / baselinePerDay, 2)
          : null,
      baselineIncludesRelease: plan.releases.some(
        (other) =>
          other.tag !== release.tag &&
          other.publishedDate >= baselineStart &&
          other.publishedDate < publishedDate,
      ),
    },
    incrementalDownloads: {
      expected,
      actual,
      incremental: expected === null || actual === null ? null : actual - expected,
    },
    usageActivity: {
      comparedDays,
      currentPerDay: currentChecks === null ? null : round(currentChecks),
      previousPerDay: previousChecks === null ? null : round(previousChecks),
      changePercent: changePercent(currentChecks, previousChecks),
    },
    dailySeries: dailyDeltas(chartTotals, baselineStart, evaluatedDate),
    baselineStartDate: baselineStart,
    activitySeries: checks.size === 0 ? [] : dailyDeltas(checks, activityStart, evaluatedDate),
    markers: [release, ...(previous ? [previous] : [])].map((item) => ({
      tag: item.tag,
      date: item.publishedDate,
    })),
  }
}

function toPublicRelease(release: PlannedRelease): ReleaseEffectRelease {
  return {
    tag: release.tag,
    label: release.label,
    publishedAt: release.publishedAt,
    prerelease: release.prerelease,
    url: release.url,
  }
}
