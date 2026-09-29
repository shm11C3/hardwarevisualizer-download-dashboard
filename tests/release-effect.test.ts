import { describe, expect, it } from 'vitest'
import type { DailyTotalRow, ReleaseEventRow } from '../src/lib/analytics'
import { addDays } from '../src/lib/date'
import {
  buildReleaseEffect,
  planReleaseEffect,
  type ReleaseEffectData,
  type TagTotalRow,
} from '../src/lib/release-effect'

const TIME_ZONE = 'Asia/Tokyo'
const TRACKING_SINCE = '2026-07-01'
const PREVIOUS_PUBLISHED = '2026-08-10'
const LATEST_PUBLISHED = '2026-08-20'

function release(tag: string, publishedAt: string, prerelease = false): ReleaseEventRow {
  return {
    tag,
    label: `HardwareVisualizer ${tag}`,
    publishedAt,
    prerelease,
    url: `https://example.com/${tag}`,
  }
}

const PREVIOUS = release('v1.10.1', '2026-08-10T03:00:00Z')
const LATEST = release('v1.11.0', '2026-08-20T03:00:00Z')

function dates(start: string, end: string): string[] {
  const result: string[] = []
  for (let date = start; date <= end; date = addDays(date, 1)) result.push(date)
  return result
}

/** Cumulative totals built from a per-interval rate keyed by the interval start date. */
function cumulative(start: string, end: string, rate: (intervalStart: string) => number) {
  const rows: DailyTotalRow[] = []
  let total = 1_000
  for (const date of dates(start, end)) {
    rows.push({ date, total })
    total += rate(date)
  }
  return rows
}

// 42 installers/day before the release, then 90/day: 126 expected vs 270 actual by Day 3.
const installerRate = (date: string) => (date < LATEST_PUBLISHED ? 42 : 90)
// Update checks: 80/day, 101/day while v1.10.1 was latest, 126/day for v1.11.0.
const checkRate = (date: string) =>
  date < PREVIOUS_PUBLISHED ? 80 : date < LATEST_PUBLISHED ? 101 : 126

function tagRows(tag: string, from: string, totals: number[]): TagTotalRow[] {
  return totals.map((total, index) => ({ tag, date: addDays(from, index), total }))
}

function data(overrides: Partial<ReleaseEffectData> = {}): ReleaseEffectData {
  return {
    trackingSince: TRACKING_SINCE,
    installerTotals: cumulative('2026-08-01', '2026-08-23', installerRate),
    updateCheckTotals: cumulative('2026-08-01', '2026-08-23', checkRate),
    tagTotals: [
      ...tagRows('v1.10.1', '2026-08-11', [60, 100, 148, 190, 220]),
      ...tagRows('v1.11.0', '2026-08-21', [100, 150, 194]),
    ],
    ...overrides,
  }
}

function evaluate(
  releases: ReleaseEventRow[],
  latestSnapshotDate: string,
  input: ReleaseEffectData,
  channel: 'stable' | 'all' = 'stable',
) {
  const plan = planReleaseEffect(releases, channel, TIME_ZONE, latestSnapshotDate)
  if (!plan) throw new Error('expected a plan')
  return buildReleaseEffect(plan, input)
}

describe('planReleaseEffect', () => {
  it('picks the newest release and the one before it, using the local publish date', () => {
    const plan = planReleaseEffect([PREVIOUS, LATEST], 'stable', TIME_ZONE, '2026-08-23')

    expect(plan?.release.tag).toBe('v1.11.0')
    expect(plan?.previous?.tag).toBe('v1.10.1')
    expect(plan?.release.publishedDate).toBe(LATEST_PUBLISHED)
    expect(plan?.day).toBe(3)
    expect(plan?.evaluatedDate).toBe('2026-08-23')
    // One week of baseline is needed; the previous release begins earlier still.
    expect(plan?.fetchFrom).toBe(PREVIOUS_PUBLISHED)
  })

  it('assigns a release to the day it was published in the configured zone', () => {
    // 2026-08-19T16:00Z is already 2026-08-20 01:00 in Asia/Tokyo.
    const plan = planReleaseEffect(
      [release('v1.11.0', '2026-08-19T16:00:00Z')],
      'stable',
      TIME_ZONE,
      '2026-08-22',
    )
    expect(plan?.release.publishedDate).toBe('2026-08-20')
    expect(plan?.day).toBe(2)
  })

  it('skips pre-releases on the stable channel and keeps them otherwise', () => {
    const beta = release('v1.12.0-beta.1', '2026-08-22T03:00:00Z', true)

    expect(
      planReleaseEffect([PREVIOUS, LATEST, beta], 'stable', TIME_ZONE, '2026-08-23')?.release.tag,
    ).toBe('v1.11.0')
    const all = planReleaseEffect([PREVIOUS, LATEST, beta], 'all', TIME_ZONE, '2026-08-23')
    expect(all?.release).toMatchObject({ tag: 'v1.12.0-beta.1', prerelease: true })
    expect(all?.previous?.tag).toBe('v1.11.0')
  })

  it('caps the evaluation at the adoption window while keeping the elapsed days', () => {
    const plan = planReleaseEffect([PREVIOUS, LATEST], 'stable', TIME_ZONE, '2026-10-19')
    expect(plan).toMatchObject({ day: 30, elapsedDays: 60, evaluatedDate: '2026-09-19' })
  })

  it('returns null without a comparable release', () => {
    expect(planReleaseEffect([], 'stable', TIME_ZONE, '2026-08-23')).toBeNull()
    expect(
      planReleaseEffect(
        [release('v1.0.0-rc.1', '2026-08-20T00:00:00Z', true)],
        'stable',
        TIME_ZONE,
        '2026-08-23',
      ),
    ).toBeNull()
  })
})

describe('buildReleaseEffect', () => {
  it('compares adoption, lift, incremental downloads and activity at the same elapsed day', () => {
    const effect = evaluate([PREVIOUS, LATEST], '2026-08-23', data())

    expect(effect.day).toBe(3)
    expect(effect.adoptionVelocity).toEqual({ current: 194, previous: 148, changePercent: 31.1 })
    expect(effect.releaseLift).toEqual({
      baselinePerDay: 42,
      postPerDay: 90,
      multiple: 2.14,
      baselineIncludesRelease: false,
    })
    expect(effect.incrementalDownloads).toEqual({ expected: 126, actual: 270, incremental: 144 })
    expect(effect.usageActivity).toEqual({
      comparedDays: 3,
      currentPerDay: 126,
      previousPerDay: 101,
      changePercent: 24.8,
    })
  })

  it('returns the daily series around the release and the markers to draw', () => {
    const effect = evaluate([PREVIOUS, LATEST], '2026-08-23', data())

    // Seven baseline days plus three days after publish.
    expect(effect.baselineStartDate).toBe('2026-08-13')
    expect(effect.dailySeries).toHaveLength(10)
    expect(effect.dailySeries[0]).toEqual({ date: '2026-08-13', downloads: 42 })
    expect(effect.dailySeries.at(-1)).toEqual({ date: '2026-08-22', downloads: 90 })
    expect(effect.activitySeries[0]?.date).toBe(PREVIOUS_PUBLISHED)
    expect(effect.activitySeries.at(-1)).toEqual({ date: '2026-08-22', downloads: 126 })
    expect(effect.markers).toEqual([
      { tag: 'v1.11.0', date: LATEST_PUBLISHED },
      { tag: 'v1.10.1', date: PREVIOUS_PUBLISHED },
    ])
  })

  it('shows no comparison for a release published after the last snapshot', () => {
    const effect = evaluate([PREVIOUS, LATEST], '2026-08-20', data())

    expect(effect.day).toBe(0)
    expect(effect.adoptionVelocity).toEqual({ current: null, previous: null, changePercent: null })
    expect(effect.releaseLift.multiple).toBeNull()
    expect(effect.incrementalDownloads.incremental).toBeNull()
    expect(effect.usageActivity).toEqual({
      comparedDays: null,
      currentPerDay: null,
      previousPerDay: null,
      changePercent: null,
    })
  })

  it('has nothing to compare against without a previous release', () => {
    const effect = evaluate([LATEST], '2026-08-23', data())

    expect(effect.previousRelease).toBeNull()
    expect(effect.adoptionVelocity.previous).toBeNull()
    expect(effect.adoptionVelocity.changePercent).toBeNull()
    expect(effect.usageActivity).toEqual({
      comparedDays: 3,
      currentPerDay: 126,
      previousPerDay: null,
      changePercent: null,
    })
    // Lift only needs the release's own baseline, so it survives.
    expect(effect.releaseLift.multiple).toBe(2.14)
    expect(effect.markers).toEqual([{ tag: 'v1.11.0', date: LATEST_PUBLISHED }])
  })

  it('does not fall back to a nearby snapshot when a baseline endpoint is missing', () => {
    const missing = data().installerTotals.filter((row) => row.date !== '2026-08-13')
    const effect = evaluate([PREVIOUS, LATEST], '2026-08-23', data({ installerTotals: missing }))

    expect(effect.releaseLift).toMatchObject({ baselinePerDay: null, multiple: null })
    expect(effect.incrementalDownloads).toEqual({ expected: null, actual: 270, incremental: null })
    // Adoption reads its own per-release counts, which are still complete.
    expect(effect.adoptionVelocity.changePercent).toBe(31.1)
    // The missing day also breaks the daily bars on both sides of it.
    expect(effect.dailySeries[0]?.downloads).toBeNull()
  })

  it('leaves the evaluation end null when its snapshot was not collected', () => {
    const missing = data().installerTotals.filter((row) => row.date !== '2026-08-23')
    const effect = evaluate([PREVIOUS, LATEST], '2026-08-23', data({ installerTotals: missing }))

    expect(effect.releaseLift.postPerDay).toBeNull()
    expect(effect.incrementalDownloads.actual).toBeNull()
  })

  it('has no lift when the baseline is zero but still reports the incremental downloads', () => {
    const flat = cumulative('2026-08-01', '2026-08-23', (date) =>
      date < LATEST_PUBLISHED ? 0 : 90,
    )
    const effect = evaluate([PREVIOUS, LATEST], '2026-08-23', data({ installerTotals: flat }))

    expect(effect.releaseLift).toMatchObject({ baselinePerDay: 0, postPerDay: 90, multiple: null })
    expect(effect.incrementalDownloads).toEqual({ expected: 0, actual: 270, incremental: 270 })
  })

  it('reports a shortfall as a negative incremental value', () => {
    const slow = cumulative('2026-08-01', '2026-08-23', (date) =>
      date < LATEST_PUBLISHED ? 42 : 30,
    )
    const effect = evaluate([PREVIOUS, LATEST], '2026-08-23', data({ installerTotals: slow }))

    expect(effect.releaseLift.multiple).toBe(0.71)
    expect(effect.incrementalDownloads.incremental).toBe(-36)
  })

  it('keeps the release own downloads on the publish date out of the baseline', () => {
    // A collection ran after publishing, so the publish-date snapshot already holds 15 of its downloads.
    const installerTotals = data().installerTotals.map((row) =>
      row.date >= LATEST_PUBLISHED ? { ...row, total: row.total + 15 } : row,
    )
    const effect = evaluate(
      [PREVIOUS, LATEST],
      '2026-08-23',
      data({
        installerTotals,
        tagTotals: [...data().tagTotals, { tag: 'v1.11.0', date: LATEST_PUBLISHED, total: 15 }],
      }),
    )

    expect(effect.releaseLift.baselinePerDay).toBe(42)
    expect(effect.incrementalDownloads.actual).toBe(270 + 15)
  })

  it('draws publish-day downloads in the post-release bar, matching the KPIs', () => {
    const installerTotals = data().installerTotals.map((row) =>
      row.date >= LATEST_PUBLISHED ? { ...row, total: row.total + 15 } : row,
    )
    const effect = evaluate(
      [PREVIOUS, LATEST],
      '2026-08-23',
      data({
        installerTotals,
        tagTotals: [...data().tagTotals, { tag: 'v1.11.0', date: LATEST_PUBLISHED, total: 15 }],
      }),
    )
    const bar = (date: string) => effect.dailySeries.find((point) => point.date === date)?.downloads

    expect(bar('2026-08-19')).toBe(42)
    expect(bar('2026-08-20')).toBe(90 + 15)
    expect(
      effect.dailySeries.reduce((sum, point) => sum + (point.downloads ?? 0), 0) - 42 * 7,
    ).toBe(effect.incrementalDownloads.actual)
  })

  it('flags a baseline that contains another release', () => {
    const recent = release('v1.10.2', '2026-08-16T03:00:00Z')
    const effect = evaluate([PREVIOUS, recent, LATEST], '2026-08-23', data())

    expect(effect.previousRelease?.tag).toBe('v1.10.2')
    expect(effect.releaseLift.baselineIncludesRelease).toBe(true)
  })

  it('does not compare a release that was already live when tracking began', () => {
    const effect = evaluate([PREVIOUS, LATEST], '2026-08-23', data({ trackingSince: '2026-08-11' }))

    // v1.10.1's first snapshot is the tracking start, so its count includes older downloads.
    expect(effect.adoptionVelocity).toEqual({ current: 194, previous: null, changePercent: null })
  })

  it('has no percentage when the previous release had no downloads yet', () => {
    const effect = evaluate(
      [PREVIOUS, LATEST],
      '2026-08-23',
      data({
        tagTotals: [
          ...tagRows('v1.10.1', '2026-08-11', [0, 0, 0]),
          ...tagRows('v1.11.0', '2026-08-21', [100, 150, 194]),
        ],
      }),
    )

    expect(effect.adoptionVelocity).toEqual({ current: 194, previous: 0, changePercent: null })
  })

  it('shows no activity when the release has no latest.json', () => {
    const effect = evaluate([PREVIOUS, LATEST], '2026-08-23', data({ updateCheckTotals: [] }))

    expect(effect.usageActivity).toEqual({
      comparedDays: 3,
      currentPerDay: null,
      previousPerDay: null,
      changePercent: null,
    })
    expect(effect.activitySeries).toEqual([])
    expect(effect.releaseLift.multiple).toBe(2.14)
  })

  it('compares update checks over the shared days when the releases are close together', () => {
    // v1.11.0 came out 2 days after v1.10.1, so Day 3 of v1.10.1 already overlaps it.
    const quick = release('v1.10.1', '2026-08-18T03:00:00Z')
    const effect = evaluate([quick, LATEST], '2026-08-23', data())

    expect(effect.day).toBe(3)
    expect(effect.usageActivity).toEqual({
      comparedDays: 2,
      currentPerDay: 126,
      previousPerDay: 101,
      changePercent: 24.8,
    })
  })

  it('tracks update checks across the switch to the new release latest.json', () => {
    // Each release has its own latest.json; only their sum is continuous.
    const effect = evaluate([PREVIOUS, LATEST], '2026-08-23', data())
    const days = effect.activitySeries.filter((point) => point.date >= '2026-08-18')

    expect(days.map((point) => point.downloads)).toEqual([101, 101, 126, 126, 126])
  })

  it('evaluates a capped window on the adoption curve horizon', () => {
    const totals = cumulative('2026-08-01', '2026-10-19', installerRate)
    const effect = evaluate(
      [PREVIOUS, LATEST],
      '2026-10-19',
      data({
        installerTotals: totals,
        tagTotals: [
          ...tagRows(
            'v1.10.1',
            '2026-08-11',
            Array.from({ length: 40 }, (_, index) => (index + 1) * 50),
          ),
          ...tagRows(
            'v1.11.0',
            '2026-08-21',
            Array.from({ length: 60 }, (_, index) => (index + 1) * 75),
          ),
        ],
      }),
    )

    expect(effect).toMatchObject({ day: 30, elapsedDays: 60, evaluatedDate: '2026-09-19' })
    expect(effect.adoptionVelocity).toMatchObject({ current: 2_250, previous: 1_500 })
    expect(effect.incrementalDownloads.actual).toBe(90 * 30)
  })
})
