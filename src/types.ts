export type Platform = 'windows' | 'macos' | 'linux' | 'unknown'
export type Architecture = 'x64' | 'arm64' | 'x86' | 'universal' | 'unknown'
export type AssetKind = 'installer' | 'updater' | 'archive' | 'metadata' | 'other'
export type ChannelFilter = 'stable' | 'all'
export type ScopeFilter = 'installers' | 'distribution' | 'all'

export interface AppEnv {
  Bindings: CloudflareBindings
}

export interface GitHubReleaseAsset {
  id: number
  name: string
  label: string | null
  content_type: string
  size: number
  download_count: number
  browser_download_url: string
  created_at: string
  updated_at: string
}

export interface GitHubRelease {
  id: number
  tag_name: string
  name: string | null
  html_url: string
  created_at?: string
  draft: boolean
  prerelease: boolean
  published_at: string | null
  assets: GitHubReleaseAsset[]
}

export interface CollectionResult {
  runId: string
  snapshotDate: string
  capturedAt: string
  releases: number
  assets: number
  durationMs: number
}

export interface DashboardQuery {
  days: 7 | 30 | 90 | 365
  channel: ChannelFilter
  scope: ScopeFilter
}

export interface SeriesPoint {
  date: string
  totalDownloads: number
  dailyDownloads: number | null
  observed: boolean
}

export interface BreakdownItem {
  key: string
  label: string
  downloads: number
  totalDownloads: number
  share: number
}

export interface ReleaseBreakdownItem extends BreakdownItem {
  publishedAt: string
  prerelease: boolean
  url: string
}

export interface AssetBreakdownItem {
  id: number
  name: string
  tag: string
  platform: Platform
  architecture: Architecture
  kind: AssetKind
  url: string
  downloads: number
  totalDownloads: number
  share: number
}

export interface DashboardInsight {
  kind: 'growth' | 'platform' | 'release' | 'peak' | 'data'
  title: string
  value: string
  body: string
}

export interface CollectionRunSummary {
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'success' | 'failed'
  fetchedReleases: number
  fetchedAssets: number
  durationMs: number | null
}

export interface DashboardResponse {
  status: 'ok'
  meta: {
    owner: string
    repo: string
    generatedAt: string
    latestSnapshotDate: string
    trackingSince: string
    requestedStartDate: string
    effectiveBaselineDate: string
    timeZone: string
    days: DashboardQuery['days']
    channel: ChannelFilter
    scope: ScopeFilter
    observedSnapshots: number
    expectedSnapshots: number
    completeness: number
    lastCollection: CollectionRunSummary | null
  }
  summary: {
    totalDownloads: number
    periodDownloads: number
    previousPeriodDownloads: number | null
    growthPercent: number | null
    averagePerDay: number
    latestDayDownloads: number | null
    latestDayDate: string | null
  }
  series: SeriesPoint[]
  platformBreakdown: BreakdownItem[]
  releaseBreakdown: ReleaseBreakdownItem[]
  topAssets: AssetBreakdownItem[]
  insights: DashboardInsight[]
}

export interface EmptyDashboardResponse {
  status: 'empty'
  meta: {
    owner: string
    repo: string
    generatedAt: string
    timeZone: string
    days: DashboardQuery['days']
    channel: ChannelFilter
    scope: ScopeFilter
    lastCollection: CollectionRunSummary | null
  }
  message: string
}
