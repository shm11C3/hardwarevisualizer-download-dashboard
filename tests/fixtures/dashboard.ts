// Synthetic data shaped exactly like the API's DashboardResponse, so the type
// checker catches drift between the fixture and the real payload the views
// render in production.
import { coerceDashboardQuery } from '../../src/lib/query'
import type {
  AdoptionCurve,
  Architecture,
  AssetBreakdownItem,
  BreakdownItem,
  DashboardResponse,
  Platform,
  PlatformSeriesItem,
  ReleaseBreakdownItem,
  SeriesPoint,
} from '../../src/types'

const END_DATE = '2026-08-22'
const ONE_DAY = 86_400_000

interface Row {
  date: string
  daily: number
  total: number
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(value: string, days: number): string {
  return dateKey(new Date(Date.parse(`${value}T00:00:00Z`) + days * ONE_DAY))
}

function pseudoRandom(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

function dailyValue(index: number): number {
  const trend = Math.floor(index / 80)
  const weekly = Math.sin((index / 7) * Math.PI * 2) * 5
  const releaseSpike = [56, 134, 221, 318, 354].reduce(
    (sum, releaseIndex) => sum + Math.max(0, 72 - Math.abs(index - releaseIndex) * 18),
    0,
  )
  return Math.max(3, Math.round(18 + trend + weekly + pseudoRandom(index) * 14 + releaseSpike))
}

const ALL_ROWS: Row[] = (() => {
  const rows: Row[] = []
  let cumulative = 4_180
  for (let index = 0; index <= 400; index += 1) {
    const daily = dailyValue(index)
    cumulative += daily
    rows.push({ date: addDays(END_DATE, index - 400), daily, total: cumulative })
  }
  return rows
})()

function rowAt(index: number): Row {
  const row = ALL_ROWS[Math.min(Math.max(index, 0), ALL_ROWS.length - 1)]
  if (!row) throw new Error('preview fixture has no rows')
  return row
}

function round(value: number, digits = 1): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function platformBreakdown(period: number): BreakdownItem[] {
  const windows = Math.round(period * 0.58)
  const macos = Math.round(period * 0.27)
  const linux = Math.max(0, period - windows - macos)
  return [
    { key: 'windows', label: 'Windows', downloads: windows, totalDownloads: 4_981 },
    { key: 'macos', label: 'macOS', downloads: macos, totalDownloads: 2_328 },
    { key: 'linux', label: 'Linux', downloads: linux, totalDownloads: 1_291 },
  ].map((item) => ({ ...item, share: period ? item.downloads / period : 0 }))
}

function architectureBreakdown(period: number): BreakdownItem[] {
  const x64 = Math.round(period * 0.78)
  const arm64 = Math.round(period * 0.17)
  const unknown = Math.max(0, period - x64 - arm64)
  return [
    { key: 'x64', label: 'x64', downloads: x64, totalDownloads: 6_706 },
    { key: 'arm64', label: 'ARM64', downloads: arm64, totalDownloads: 1_462 },
    { key: 'unknown', label: '—', downloads: unknown, totalDownloads: 432 },
  ].map((item) => ({ ...item, share: period ? item.downloads / period : 0 }))
}

// Full ISO timestamps, matching what the API returns for GitHub publish times.
// Date-only values here would hide formatting bugs that only appear in production.
const RELEASES = [
  { tag: 'v1.9.2', weight: 0.57, total: 2_461, publishedAt: '2026-07-21T17:43:53Z' },
  { tag: 'v1.9.1', weight: 0.22, total: 1_738, publishedAt: '2026-06-25T22:44:07Z' },
  { tag: 'v1.9.0', weight: 0.11, total: 1_319, publishedAt: '2026-06-02T08:12:40Z' },
  { tag: 'v1.8.1', weight: 0.065, total: 988, publishedAt: '2026-04-18T11:05:19Z' },
  { tag: 'v1.8.0', weight: 0.035, total: 721, publishedAt: '2026-03-11T14:38:02Z' },
]

function releaseBreakdown(period: number): ReleaseBreakdownItem[] {
  let used = 0
  return RELEASES.map((release, index) => {
    const downloads =
      index === RELEASES.length - 1
        ? Math.max(0, period - used)
        : Math.round(period * release.weight)
    used += downloads
    return {
      key: release.tag,
      label: `HardwareVisualizer ${release.tag}`,
      downloads,
      totalDownloads: release.total,
      share: period ? downloads / period : 0,
      publishedAt: release.publishedAt,
      prerelease: false,
      url: `https://github.com/shm11C3/HardwareVisualizer/releases/tag/${release.tag}`,
    }
  })
}

function adoptionCurves(): AdoptionCurve[] {
  return RELEASES.slice(0, 3).map((release, releaseIndex) => ({
    tag: release.tag,
    label: `HardwareVisualizer ${release.tag}`,
    publishedAt: release.publishedAt,
    url: `https://github.com/shm11C3/HardwareVisualizer/releases/tag/${release.tag}`,
    points: Array.from({ length: 31 }, (_, day) => ({
      day,
      downloads: Math.round((releaseIndex + 1) * 6 + day * (52 - releaseIndex * 11)),
    })),
  }))
}

const ASSETS: {
  name: string
  platform: Platform
  architecture: Architecture
  weight: number
  total: number
}[] = [
  {
    name: 'HardwareVisualizer_1.9.2_x64-setup.exe',
    platform: 'windows',
    architecture: 'x64',
    weight: 0.31,
    total: 2_112,
  },
  {
    name: 'HardwareVisualizer_1.9.2_x64.dmg',
    platform: 'macos',
    architecture: 'x64',
    weight: 0.22,
    total: 1_483,
  },
  {
    name: 'HardwareVisualizer_1.9.2_amd64.AppImage',
    platform: 'linux',
    architecture: 'x64',
    weight: 0.15,
    total: 1_018,
  },
  {
    name: 'HardwareVisualizer_1.9.2_amd64.deb',
    platform: 'linux',
    architecture: 'x64',
    weight: 0.12,
    total: 771,
  },
  {
    name: 'HardwareVisualizer_1.9.2_aarch64.dmg',
    platform: 'macos',
    architecture: 'arm64',
    weight: 0.08,
    total: 649,
  },
  {
    name: 'HardwareVisualizer_1.9.2_x86_64.rpm',
    platform: 'linux',
    architecture: 'x64',
    weight: 0.06,
    total: 522,
  },
  {
    name: 'HardwareVisualizer_1.9.1_x64-setup.exe',
    platform: 'windows',
    architecture: 'x64',
    weight: 0.035,
    total: 814,
  },
  {
    name: 'HardwareVisualizer_1.9.1_amd64.AppImage',
    platform: 'linux',
    architecture: 'x64',
    weight: 0.025,
    total: 486,
  },
]

function topAssets(period: number): AssetBreakdownItem[] {
  return ASSETS.map((asset, index) => {
    const downloads = Math.round(period * asset.weight)
    return {
      id: 1_000 + index,
      name: asset.name,
      tag: index < 6 ? 'v1.9.2' : 'v1.9.1',
      platform: asset.platform,
      architecture: asset.architecture,
      kind: 'installer' as const,
      url: `https://github.com/shm11C3/HardwareVisualizer/releases/download/v1.9.2/${encodeURIComponent(asset.name)}`,
      downloads,
      totalDownloads: asset.total,
      share: period ? downloads / period : 0,
    }
  })
}

export function previewDashboard(url: URL): DashboardResponse {
  const { days, channel, scope } = coerceDashboardQuery(url)
  const latestIndex = ALL_ROWS.length - 1
  const firstIndex = latestIndex - (days - 1)
  const baselineIndex = Math.max(0, firstIndex - 1)
  const previousBaselineIndex = Math.max(0, baselineIndex - days)

  const latest = rowAt(latestIndex)
  const baseline = rowAt(baselineIndex)
  const previousBaseline = rowAt(previousBaselineIndex)
  const periodDownloads = latest.total - baseline.total
  const previousPeriodDownloads = baseline.total - previousBaseline.total
  const growthPercent = previousPeriodDownloads
    ? round(((periodDownloads - previousPeriodDownloads) / previousPeriodDownloads) * 100)
    : null

  const series: SeriesPoint[] = ALL_ROWS.slice(Math.max(0, firstIndex)).map((row) => ({
    date: row.date,
    totalDownloads: row.total,
    dailyDownloads: row.daily,
    observed: true,
  }))
  const first = series[0] ?? {
    date: latest.date,
    totalDownloads: latest.total,
    dailyDownloads: latest.daily,
    observed: true,
  }

  const platforms = platformBreakdown(periodDownloads)
  const platformSeries: PlatformSeriesItem[] = platforms.map((platform) => ({
    key: platform.key as Platform,
    label: platform.label,
    points: series.map((point) => ({
      date: point.date,
      dailyDownloads:
        point.dailyDownloads === null ? null : Math.round(point.dailyDownloads * platform.share),
    })),
  }))
  const releases = releaseBreakdown(periodDownloads)
  const leadPlatform = platforms[0]
  const leadRelease = releases[0]
  const peak = [...series].sort(
    (left, right) => (right.dailyDownloads ?? 0) - (left.dailyDownloads ?? 0),
  )[0]
  const installerSeries = series.map((point) => ({
    ...point,
    totalDownloads: Math.round(point.totalDownloads * 0.62),
    dailyDownloads: point.dailyDownloads === null ? null : Math.round(point.dailyDownloads * 0.62),
  }))
  const updaterSeries = series.map((point) => ({
    ...point,
    totalDownloads: Math.round(point.totalDownloads * 0.28),
    dailyDownloads: point.dailyDownloads === null ? null : Math.round(point.dailyDownloads * 0.28),
  }))

  return {
    status: 'ok',
    meta: {
      owner: 'shm11C3',
      repo: 'HardwareVisualizer',
      generatedAt: '2026-08-22T02:35:00.000Z',
      latestSnapshotDate: END_DATE,
      trackingSince: rowAt(0).date,
      requestedStartDate: first.date,
      effectiveBaselineDate: baseline.date,
      timeZone: 'Asia/Tokyo',
      days,
      channel,
      scope,
      observedSnapshots: days + 1,
      expectedSnapshots: days + 1,
      completeness: 1,
      lastCollection: {
        startedAt: '2026-08-21T15:10:00.000Z',
        finishedAt: '2026-08-21T15:10:01.284Z',
        status: 'success',
        fetchedReleases: 20,
        fetchedAssets: 176,
        durationMs: 1_284,
      },
    },
    summary: {
      totalDownloads: latest.total,
      periodDownloads,
      previousPeriodDownloads,
      growthPercent,
      averagePerDay: round(periodDownloads / days, 2),
      latestDayDownloads: latest.daily,
      latestDayDate: END_DATE,
    },
    series,
    releaseEvents: RELEASES.filter((release) => {
      const date = release.publishedAt.slice(0, 10)
      return date >= first.date && date <= latest.date
    }).map((release) => ({
      tag: release.tag,
      label: `HardwareVisualizer ${release.tag}`,
      prerelease: false,
      url: `https://github.com/shm11C3/HardwareVisualizer/releases/tag/${release.tag}`,
      date: release.publishedAt.slice(0, 10),
    })),
    platformSeries,
    platformBreakdown: platforms,
    architectureBreakdown: architectureBreakdown(periodDownloads),
    releaseBreakdown: releases,
    adoptionCurves: adoptionCurves(),
    topAssets: topAssets(periodDownloads),
    updateHealth: {
      installer: { periodDownloads: Math.round(periodDownloads * 0.62), series: installerSeries },
      updater: { periodDownloads: Math.round(periodDownloads * 0.28), series: updaterSeries },
    },
    latestVersionShare: 0.57,
    latestVersionTag: 'v1.9.2',
    latestVersionPublishedAt: '2026-07-21T17:43:53Z',
    insights: [
      {
        kind: 'growth',
        title: '期間トレンド',
        value: growthPercent === null ? '—' : `${growthPercent > 0 ? '+' : ''}${growthPercent}%`,
        body: `前期間の ${previousPeriodDownloads.toLocaleString('ja-JP')} 件に対し、現在期間は ${periodDownloads.toLocaleString('ja-JP')} 件です。`,
      },
      {
        kind: 'platform',
        title: '最多プラットフォーム',
        value: leadPlatform?.label ?? '—',
        body: `期間内 ${(leadPlatform?.downloads ?? 0).toLocaleString('ja-JP')} 件で、構成比 ${round((leadPlatform?.share ?? 0) * 100)}% です。`,
      },
      {
        kind: 'release',
        title: '牽引リリース',
        value: leadRelease?.key ?? '—',
        body: `期間内 ${(leadRelease?.downloads ?? 0).toLocaleString('ja-JP')} 件で、対象ダウンロードを最も牽引しています。`,
      },
      {
        kind: 'latest',
        title: '最新バージョン比率',
        value: '57%',
        body: 'v1.9.2 が期間内ダウンロードの中心です。',
      },
      {
        kind: 'peak',
        title: 'ピーク日',
        value: peak?.date ?? '—',
        body: `${(peak?.dailyDownloads ?? 0).toLocaleString('ja-JP')} 件を記録しました。リリース直後の反応が表れています。`,
      },
      {
        kind: 'data',
        title: 'データ完全性',
        value: '100%',
        body: `${days + 1} / ${days + 1} 日分のスナップショットを確認できました。`,
      },
      {
        kind: 'milestone',
        title: '累計マイルストーン',
        value: '10,000 件',
        body: '表示期間より前に到達。次の 50,000 件までの残数を表示します。',
      },
      {
        kind: 'streak',
        title: '観測ストリーク',
        value: `${days} 日`,
        body: '最新日から連続してスナップショットを観測できています。',
      },
    ],
  }
}
