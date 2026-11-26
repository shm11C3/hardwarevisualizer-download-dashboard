import { describe, expect, it } from 'vitest'
import {
  buildAdoptionCurves,
  buildArchitectureBreakdown,
  buildDailySeries,
  buildLatestVersionMetrics,
  buildLaunchActivity,
  buildMacosUpdateSplit,
  buildPeriodAnalytics,
  buildPlatformSeries,
  buildRepoStats,
  buildStaleLinks,
  calculateMilestone,
  calculateObservationStreak,
  calculateWeekdayAverages,
  planStaleLinks,
  type ReleaseEventRow,
  type StaleLinkRow,
  selectReleaseEvents,
} from '../src/lib/analytics'
import type { SeriesPoint } from '../src/types'

function point(
  date: string,
  totalDownloads: number,
  dailyDownloads: number | null,
  observed = true,
  intervalStartDate = date,
): SeriesPoint {
  return { date, intervalStartDate, totalDownloads, dailyDownloads, observed }
}

describe('buildPeriodAnalytics', () => {
  it('uses the first snapshot as a baseline instead of counting historical totals', () => {
    const result = buildPeriodAnalytics(
      [
        { date: '2026-08-20', total: 1_000 },
        { date: '2026-08-21', total: 1_012 },
        { date: '2026-08-22', total: 1_020 },
      ],
      30,
    )

    expect(result?.periodDownloads).toBe(20)
    expect(result?.series[0]?.dailyDownloads).toBeNull()
    expect(result?.series[1]?.dailyDownloads).toBe(12)
    expect(result?.latestDayDate).toBe('2026-08-21')
  })

  it('does not invent a one-day delta across a missing snapshot', () => {
    const result = buildPeriodAnalytics(
      [
        { date: '2026-08-19', total: 100 },
        { date: '2026-08-20', total: 110 },
        { date: '2026-08-22', total: 145 },
      ],
      7,
    )

    const missing = result?.series.find((point) => point.date === '2026-08-21')
    const afterGap = result?.series.find((point) => point.date === '2026-08-22')
    expect(missing).toMatchObject({ observed: false, dailyDownloads: null, totalDownloads: 110 })
    expect(afterGap?.dailyDownloads).toBeNull()
    expect(result?.periodDownloads).toBe(45)
  })

  it('calculates a comparable previous-period growth rate', () => {
    const rows = Array.from({ length: 15 }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, '0')}`,
      total: index < 8 ? 100 + index * 10 : 170 + (index - 7) * 20,
    }))
    const result = buildPeriodAnalytics(rows, 7)

    expect(result?.periodDownloads).toBe(140)
    expect(result?.previousPeriodDownloads).toBe(70)
    expect(result?.growthPercent).toBe(100)
  })
})

describe('buildArchitectureBreakdown', () => {
  it('labels architectures and calculates period shares', () => {
    expect(
      buildArchitectureBreakdown(
        [
          { key: 'x64', downloads: 60, total_downloads: 600 },
          { key: 'arm64', downloads: 40, total_downloads: 400 },
        ],
        100,
        1_000,
      ),
    ).toEqual([
      { key: 'x64', label: 'x64', downloads: 60, totalDownloads: 600, share: 0.6 },
      { key: 'arm64', label: 'ARM64', downloads: 40, totalDownloads: 400, share: 0.4 },
    ])
  })

  it('falls back to cumulative shares when the period has no downloads', () => {
    expect(
      buildArchitectureBreakdown([{ key: 'universal', downloads: 0, total_downloads: 25 }], 0, 100),
    ).toEqual([
      {
        key: 'universal',
        label: 'Universal',
        downloads: 0,
        totalDownloads: 25,
        share: 0.25,
      },
    ])
  })
})

describe('buildAdoptionCurves', () => {
  it('keeps observed Day 0 values and leaves missing days out', () => {
    const result = buildAdoptionCurves(
      [
        {
          tag: 'v2.0.0',
          label: 'Version 2',
          published_at: '2026-08-01T15:30:00Z',
          url: 'https://example.com/v2',
          date: '2026-08-02',
          downloads: 12,
        },
        {
          tag: 'v2.0.0',
          label: 'Version 2',
          published_at: '2026-08-01T15:30:00Z',
          url: 'https://example.com/v2',
          date: '2026-08-04',
          downloads: 31,
        },
      ],
      '2026-08-01',
      'Asia/Tokyo',
    )

    expect(result[0]?.points).toEqual([
      { day: 0, downloads: 12 },
      { day: 2, downloads: 31 },
    ])
  })

  it('excludes pre-tracking releases and points after Day 30', () => {
    const rows = [
      ['old', '2026-07-31T00:00:00Z', '2026-08-02', 20],
      ['current', '2026-08-01T15:00:00Z', '2026-09-01', 30],
      ['current', '2026-08-01T15:00:00Z', '2026-09-02', 40],
    ].map(([tag, publishedAt, date, downloads]) => ({
      tag: String(tag),
      label: String(tag),
      published_at: String(publishedAt),
      url: 'https://example.com',
      date: String(date),
      downloads: Number(downloads),
    }))

    expect(buildAdoptionCurves(rows, '2026-08-01', 'Asia/Tokyo')).toEqual([
      {
        tag: 'current',
        label: 'current',
        publishedAt: '2026-08-01T15:00:00Z',
        url: 'https://example.com',
        points: [{ day: 30, downloads: 30 }],
      },
    ])
  })
})

describe('buildPlatformSeries', () => {
  it('attributes daily platform deltas to the interval start date', () => {
    const result = buildPlatformSeries(
      [
        { date: '2026-08-19', platform: 'windows', total: 100 },
        { date: '2026-08-20', platform: 'windows', total: 112 },
        { date: '2026-08-22', platform: 'windows', total: 150 },
        { date: '2026-08-19', platform: 'macos', total: 50 },
        { date: '2026-08-20', platform: 'macos', total: 57 },
      ],
      '2026-08-19',
      '2026-08-22',
    )

    expect(result.find((item) => item.key === 'windows')?.points).toEqual([
      { date: '2026-08-18', dailyDownloads: null },
      { date: '2026-08-19', dailyDownloads: 12 },
      { date: '2026-08-20', dailyDownloads: null },
      { date: '2026-08-21', dailyDownloads: null },
    ])
    expect(result.find((item) => item.key === 'macos')?.points[1]?.dailyDownloads).toBe(7)
  })
})

describe('selectReleaseEvents', () => {
  const rows = [
    {
      tag: 'v2.0.0-beta.1',
      label: 'Beta',
      publishedAt: '2026-08-19T15:30:00Z',
      prerelease: true,
      url: 'https://example.com/beta',
    },
    {
      tag: 'v2.0.0',
      label: 'Stable',
      publishedAt: '2026-08-21T15:30:00Z',
      prerelease: false,
      url: 'https://example.com/stable',
    },
    {
      tag: 'v1.9.0',
      label: 'Old',
      publishedAt: '2026-08-01T00:00:00Z',
      prerelease: false,
      url: 'https://example.com/old',
    },
  ]

  it('uses JST dates and keeps only releases inside the series range', () => {
    expect(selectReleaseEvents(rows, '2026-08-20', '2026-08-22', 'Asia/Tokyo', 'all')).toEqual([
      expect.objectContaining({ tag: 'v2.0.0-beta.1', date: '2026-08-20' }),
      expect.objectContaining({ tag: 'v2.0.0', date: '2026-08-22' }),
    ])
  })

  it('excludes prereleases from the stable channel', () => {
    expect(selectReleaseEvents(rows, '2026-08-20', '2026-08-22', 'Asia/Tokyo', 'stable')).toEqual([
      expect.objectContaining({ tag: 'v2.0.0' }),
    ])
  })
})

describe('buildDailySeries', () => {
  it('returns null after a missing observation instead of combining multiple days', () => {
    const series = buildDailySeries(
      [
        { date: '2026-08-19', total: 20 },
        { date: '2026-08-20', total: 25 },
        { date: '2026-08-22', total: 40 },
      ],
      '2026-08-20',
      '2026-08-22',
    )

    expect(series).toEqual([
      {
        date: '2026-08-20',
        intervalStartDate: '2026-08-19',
        totalDownloads: 25,
        dailyDownloads: 5,
        observed: true,
      },
      {
        date: '2026-08-21',
        intervalStartDate: '2026-08-20',
        totalDownloads: 25,
        dailyDownloads: null,
        observed: false,
      },
      {
        date: '2026-08-22',
        intervalStartDate: '2026-08-21',
        totalDownloads: 40,
        dailyDownloads: null,
        observed: true,
      },
    ])
  })

  it('keeps the snapshot date but attributes its delta to the interval start date', () => {
    const series = buildDailySeries(
      [
        { date: '2026-08-24', total: 6_799 },
        { date: '2026-08-25', total: 6_864 },
      ],
      '2026-08-24',
      '2026-08-25',
    )

    expect(series.at(-1)).toMatchObject({
      date: '2026-08-25',
      intervalStartDate: '2026-08-24',
      dailyDownloads: 65,
    })
  })
})

describe('buildRepoStats', () => {
  it('calculates star deltas only across consecutive observations and preserves decreases', () => {
    const result = buildRepoStats(
      [
        {
          date: '2026-08-17',
          stargazers: 100,
          forks: 10,
          viewsCount: null,
          viewsUniques: null,
          clonesCount: null,
          clonesUniques: null,
        },
        {
          date: '2026-08-18',
          stargazers: 105,
          forks: 10,
          viewsCount: 40,
          viewsUniques: 30,
          clonesCount: null,
          clonesUniques: null,
        },
        {
          date: '2026-08-20',
          stargazers: 103,
          forks: 11,
          viewsCount: null,
          viewsUniques: null,
          clonesCount: 8,
          clonesUniques: 6,
        },
        {
          date: '2026-08-21',
          stargazers: 102,
          forks: 11,
          viewsCount: null,
          viewsUniques: null,
          clonesCount: null,
          clonesUniques: null,
        },
      ],
      '2026-08-18',
      '2026-08-21',
    )

    expect(result.stars).toEqual({
      latest: 102,
      series: [
        { date: '2026-08-18', stargazers: 105, dailyDelta: 5 },
        { date: '2026-08-20', stargazers: 103, dailyDelta: null },
        { date: '2026-08-21', stargazers: 102, dailyDelta: -1 },
      ],
    })
    expect(result.traffic).toEqual([
      {
        date: '2026-08-18',
        viewsCount: 40,
        viewsUniques: 30,
        clonesCount: null,
        clonesUniques: null,
      },
      {
        date: '2026-08-20',
        viewsCount: null,
        viewsUniques: null,
        clonesCount: 8,
        clonesUniques: 6,
      },
    ])
  })

  it('returns a stable empty shape when no repository stats have been collected', () => {
    expect(buildRepoStats([], '2026-08-01', '2026-08-22')).toEqual({
      stars: { latest: null, series: [] },
      traffic: [],
    })
  })
})

describe('buildLatestVersionMetrics', () => {
  it('selects the newest published tag and calculates its period share', () => {
    expect(
      buildLatestVersionMetrics(
        [
          { tag: 'v1.2.0', publishedAt: '2026-08-10T00:00:00Z', downloads: 40 },
          { tag: 'v1.1.0', publishedAt: '2026-07-10T00:00:00Z', downloads: 60 },
        ],
        100,
      ),
    ).toEqual({
      latestVersionShare: 0.4,
      latestVersionTag: 'v1.2.0',
      latestVersionPublishedAt: '2026-08-10T00:00:00Z',
    })
  })

  it('returns a null share when the period total is zero', () => {
    expect(
      buildLatestVersionMetrics(
        [{ tag: 'v1.2.0', publishedAt: '2026-08-10T00:00:00Z', downloads: 0 }],
        0,
      ).latestVersionShare,
    ).toBeNull()
  })
})

describe('calculateWeekdayAverages', () => {
  it('groups JST calendar date keys from Monday through Sunday and excludes missing deltas', () => {
    const result = calculateWeekdayAverages([
      point('2026-08-17', 110, 10),
      point('2026-08-18', 140, 30),
      point('2026-08-24', 160, 50),
      point('2026-08-25', 160, null, false),
    ])

    expect(result.map((item) => item.label)).toEqual(['月', '火', '水', '木', '金', '土', '日'])
    expect(result[0]).toMatchObject({ average: 30, observations: 2 })
    expect(result[1]).toMatchObject({ average: 30, observations: 1 })
  })

  it('uses the interval start weekday instead of the snapshot weekday', () => {
    const result = calculateWeekdayAverages([point('2026-08-18', 110, 10, true, '2026-08-17')])

    expect(result[0]).toMatchObject({ label: '月', average: 10, observations: 1 })
    expect(result[1]).toMatchObject({ label: '火', average: 0, observations: 0 })
  })
})

describe('record calculations', () => {
  it('finds the latest 1/5 milestone, its first visible date, and the next target', () => {
    expect(
      calculateMilestone([
        point('2026-08-19', 4_900, null),
        point('2026-08-20', 5_010, 110),
        point('2026-08-21', 7_400, 2_390),
      ]),
    ).toEqual({ reached: 5_000, reachedAt: '2026-08-20', next: 10_000, remaining: 2_600 })

    expect(calculateMilestone([point('2026-08-21', 12_300, null)])).toEqual({
      reached: 10_000,
      reachedAt: null,
      next: 50_000,
      remaining: 37_700,
    })
  })

  it('counts observed snapshots continuously from the series tail', () => {
    expect(
      calculateObservationStreak([
        point('2026-08-18', 100, null, true),
        point('2026-08-19', 100, null, false),
        point('2026-08-20', 110, null, true),
        point('2026-08-21', 120, 10, true),
      ]),
    ).toBe(2)
  })
})

describe('buildLaunchActivity', () => {
  const row = (
    date: string,
    installer: number | null,
    launches: number | null,
  ): Parameters<typeof buildLaunchActivity>[0][number] => ({
    date,
    installer_assets: installer === null ? 0 : 1,
    installer_total: installer ?? 0,
    launch_assets: launches === null ? 0 : 1,
    launch_total: launches ?? 0,
  })

  it('turns cumulative latest.json counts into daily startup update checks', () => {
    const result = buildLaunchActivity(
      [
        row('2026-08-01', 100, 1000),
        row('2026-08-02', 110, 1080),
        row('2026-08-03', 125, 1200),
        row('2026-08-04', 130, 1260),
      ],
      '2026-08-02',
      '2026-08-04',
      '2026-08-01',
    )

    expect(result.launches.series.map((entry) => entry.dailyDownloads)).toEqual([80, 120, 60])
    expect(result.launches.periodDownloads).toBe(260)
    expect(result.launchesPerDay).toBe(86.7)
    expect(result.installer.periodDownloads).toBe(30)
  })

  it('keeps the total continuous when a new release starts its own latest.json', () => {
    // The old release's latest.json stops growing; the new one appears with its
    // first day of checks, so the sum across releases still moves forward.
    const result = buildLaunchActivity(
      [
        row('2026-08-01', 10, 1000),
        row('2026-08-02', 10, 1000 + 90),
        row('2026-08-03', 12, 1090 + 70),
      ],
      '2026-08-02',
      '2026-08-03',
      '2026-08-01',
    )

    expect(result.launches.series.map((entry) => entry.dailyDownloads)).toEqual([90, 70])
  })

  it('never reads a missing latest.json as zero activity', () => {
    const result = buildLaunchActivity(
      [row('2026-08-01', 10, null), row('2026-08-02', 12, null), row('2026-08-03', 15, null)],
      '2026-08-02',
      '2026-08-03',
      '2026-08-01',
    )

    expect(result.launches.series.every((entry) => entry.dailyDownloads === null)).toBe(true)
    expect(result.launches.periodDownloads).toBe(0)
    expect(result.launchesPerDay).toBeNull()
    expect(result.installer.periodDownloads).toBe(5)
  })

  it('leaves a gap for a day without a snapshot instead of spreading the increase', () => {
    const result = buildLaunchActivity(
      [row('2026-08-01', 1, 100), row('2026-08-03', 1, 300)],
      '2026-08-02',
      '2026-08-03',
      '2026-08-01',
    )

    expect(result.launches.series.map((entry) => entry.dailyDownloads)).toEqual([null, null])
    expect(result.launches.periodDownloads).toBe(200)
  })
})

describe('buildMacosUpdateSplit', () => {
  const row = (
    date: string,
    manual: number,
    updates: number | null,
  ): Parameters<typeof buildMacosUpdateSplit>[0][number] => ({
    date,
    manual_assets: 2,
    manual_total: manual,
    update_assets: updates === null ? 0 : 2,
    update_total: updates ?? 0,
  })

  it('splits dmg downloads from updater-only downloads', () => {
    const result = buildMacosUpdateSplit(
      [row('2026-08-01', 50, 10), row('2026-08-02', 53, 18), row('2026-08-03', 55, 20)],
      '2026-08-02',
      '2026-08-03',
      '2026-08-01',
    )

    expect(result.manual.series.map((entry) => entry.dailyDownloads)).toEqual([3, 2])
    expect(result.updates.series.map((entry) => entry.dailyDownloads)).toEqual([8, 2])
    expect(result.manual.periodDownloads).toBe(5)
    expect(result.updates.periodDownloads).toBe(10)
    expect(result.updateShare).toBe(0.6667)
  })

  it('has no share without any updater file', () => {
    const result = buildMacosUpdateSplit(
      [row('2026-08-01', 50, null), row('2026-08-02', 53, null)],
      '2026-08-02',
      '2026-08-02',
      '2026-08-01',
    )

    expect(result.updates.series.every((entry) => entry.dailyDownloads === null)).toBe(true)
    expect(result.updateShare).toBeNull()
  })
})

describe('stale links', () => {
  const stable = (tag: string, publishedAt: string, prerelease = false): ReleaseEventRow => ({
    tag,
    label: tag,
    publishedAt,
    prerelease,
    url: `https://example.com/${tag}`,
  })
  const releases = [
    stable('v1.0.0', '2026-07-01T03:00:00Z'),
    // 21:04 JST on 2026-08-10: v1.0.0 was still the latest for most of that day.
    stable('v1.1.0', '2026-08-10T12:04:00Z'),
    stable('v1.2.0-beta.1', '2026-08-15T03:00:00Z', true),
    stable('v1.2.0', '2026-08-20T03:00:00Z'),
  ]

  it('starts counting the day after the successor went out, ignoring pre-releases', () => {
    const plan = planStaleLinks(releases, 'Asia/Tokyo', '2026-08-01', '2026-08-25')

    expect(plan.recentStart).toBe('2026-08-18')
    expect(plan.cuts).toEqual([
      {
        tag: 'v1.0.0',
        url: 'https://example.com/v1.0.0',
        supersededBy: 'v1.1.0',
        supersededFrom: '2026-08-11',
        from: '2026-08-11',
        recent: '2026-08-18',
      },
      {
        tag: 'v1.1.0',
        url: 'https://example.com/v1.1.0',
        supersededBy: 'v1.2.0',
        supersededFrom: '2026-08-21',
        from: '2026-08-21',
        recent: '2026-08-21',
      },
    ])
  })

  it('clamps to the period and skips releases replaced only on its last day', () => {
    const plan = planStaleLinks(releases, 'Asia/Tokyo', '2026-08-15', '2026-08-21')

    expect(plan.recentStart).toBe('2026-08-15')
    expect(plan.cuts.map((cut) => [cut.tag, cut.from])).toEqual([['v1.0.0', '2026-08-15']])
  })

  it('totals stale downloads per release and their share of stable installers', () => {
    const plan = planStaleLinks(releases, 'Asia/Tokyo', '2026-08-01', '2026-08-25')
    const row = (
      tag: string,
      platform: StaleLinkRow['platform'],
      period: number,
      stale: number,
      recent: number,
    ): StaleLinkRow => ({
      tag,
      platform,
      period_downloads: period,
      stale_downloads: stale,
      recent_downloads: recent,
    })
    const result = buildStaleLinks(
      [
        row('v1.0.0', 'windows', 120, 40, 7),
        row('v1.0.0', 'macos', 12, 6, 0),
        row('v1.1.0', 'windows', 300, 25, 14),
        row('v1.1.0', 'linux', 30, 0, 0),
        row('v1.2.0', 'windows', 138, 0, 0),
      ],
      plan,
    )

    expect(result.downloads).toBe(71)
    expect(result.share).toBe(0.1183)
    expect(result.recentPerDay).toBe(3)
    expect(result.releases.map((item) => [item.tag, item.downloads, item.recentDownloads])).toEqual(
      [
        ['v1.0.0', 46, 7],
        ['v1.1.0', 25, 14],
      ],
    )
    expect(result.releases[0]?.platforms).toEqual([
      { key: 'windows', label: 'Windows', downloads: 40 },
      { key: 'macos', label: 'macOS', downloads: 6 },
    ])
    expect(result.releases[1]?.platforms.map((platform) => platform.key)).toEqual(['windows'])
  })

  it('reports nothing without stable installer downloads', () => {
    const plan = planStaleLinks([], 'Asia/Tokyo', '2026-08-01', '2026-08-25')

    expect(buildStaleLinks([], plan)).toEqual({
      downloads: 0,
      share: null,
      recentPerDay: 0,
      releases: [],
    })
  })
})
