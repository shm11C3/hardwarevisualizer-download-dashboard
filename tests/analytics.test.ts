import { describe, expect, it } from 'vitest'
import { buildArchitectureBreakdown, buildPeriodAnalytics } from '../src/lib/analytics'

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
