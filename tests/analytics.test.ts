import { describe, expect, it } from 'vitest'
import {
  buildArchitectureBreakdown,
  buildDailySeries,
  buildLatestVersionMetrics,
  buildPeriodAnalytics,
  buildPlatformSeries,
  selectReleaseEvents,
} from '../src/lib/analytics'

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

describe('buildPlatformSeries', () => {
  it('only calculates daily platform deltas for consecutive observations', () => {
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
      { date: '2026-08-19', dailyDownloads: null },
      { date: '2026-08-20', dailyDownloads: 12 },
      { date: '2026-08-21', dailyDownloads: null },
      { date: '2026-08-22', dailyDownloads: null },
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
      { date: '2026-08-20', totalDownloads: 25, dailyDownloads: 5, observed: true },
      { date: '2026-08-21', totalDownloads: 25, dailyDownloads: null, observed: false },
      { date: '2026-08-22', totalDownloads: 40, dailyDownloads: null, observed: true },
    ])
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
