export type Platform = 'windows' | 'macos' | 'linux' | 'unknown'
export type Architecture = 'x64' | 'arm64' | 'x86' | 'universal' | 'unknown'
export type AssetKind = 'installer' | 'updater' | 'archive' | 'metadata' | 'other'
export type ChannelFilter = 'stable' | 'all'
export type ScopeFilter = 'installers' | 'distribution' | 'all'
export type TrafficSeriesKey = 'viewsCount' | 'viewsUniques' | 'clonesCount' | 'clonesUniques'

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

/** Display-only series selection for the HTML dashboard. */
export interface DashboardPageQuery extends DashboardQuery {
  traffic?: TrafficSeriesKey[]
}

export interface SeriesPoint {
  /** Calendar date when the daily observation interval ended. */
  date: string
  /** Calendar date when the daily observation interval started. */
  intervalStartDate: string
  totalDownloads: number
  dailyDownloads: number | null
  observed: boolean
}

export interface RepoStarPoint {
  date: string
  stargazers: number
  dailyDelta: number | null
}

export interface RepoTrafficPoint {
  date: string
  viewsCount: number | null
  viewsUniques: number | null
  clonesCount: number | null
  clonesUniques: number | null
}

export interface RepoStats {
  stars: {
    latest: number | null
    series: RepoStarPoint[]
  }
  traffic: RepoTrafficPoint[]
}

export interface ReleaseEvent {
  tag: string
  label: string
  prerelease: boolean
  url: string
  date: string
}

export interface PlatformSeriesPoint {
  /** Calendar date when the daily observation interval started. */
  date: string
  dailyDownloads: number | null
}

export interface PlatformSeriesItem {
  key: Platform
  label: string
  points: PlatformSeriesPoint[]
}

export interface AdoptionCurvePoint {
  day: number
  downloads: number
}

export interface AdoptionCurve {
  tag: string
  label: string
  publishedAt: string
  url: string
  points: AdoptionCurvePoint[]
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
  kind: 'growth' | 'platform' | 'release' | 'peak' | 'data' | 'latest' | 'milestone' | 'streak'
  title: string
  value: string
  body: string
}

export interface ActivitySeries {
  periodDownloads: number
  series: SeriesPoint[]
}

export interface LaunchActivity {
  /** Installer downloads. Files the auto-updater also fetches are included, so this is not "new installs". */
  installer: ActivitySeries
  /** latest.json downloads: the update check the app makes at every startup. */
  launches: ActivitySeries
  /** Mean startup update checks per observed day, or null without an observed day. */
  launchesPerDay: number | null
}

export interface ReleaseEffectRelease {
  tag: string
  label: string
  publishedAt: string
  prerelease: boolean
  url: string
}

export interface ReleaseEffectDailyPoint {
  /** Calendar date when the daily observation interval started. */
  date: string
  downloads: number | null
}

export interface ReleaseEffectMarker {
  tag: string
  /** Interval start date the release was published on. */
  date: string
}

/**
 * Release-relative signals for the latest release. Every metric is a proxy
 * built from cumulative download counts; none of them measures users. A field
 * is null whenever the snapshots needed to compare like with like are missing.
 */
export interface ReleaseEffect {
  release: ReleaseEffectRelease
  previousRelease: ReleaseEffectRelease | null
  /** Days from the publish date to the last evaluated snapshot, capped at the evaluation window. */
  day: number
  /** Days from the publish date to the latest snapshot, before the cap. */
  elapsedDays: number
  /** Date of the snapshot the evaluation ends on. */
  evaluatedDate: string
  adoptionVelocity: {
    /** Cumulative installer downloads of the release at Day N. */
    current: number | null
    /** Cumulative installer downloads of the previous release at its own Day N. */
    previous: number | null
    changePercent: number | null
  }
  releaseLift: {
    baselinePerDay: number | null
    postPerDay: number | null
    multiple: number | null
    /** True when another release fell inside the baseline window and may inflate it. */
    baselineIncludesRelease: boolean
  }
  incrementalDownloads: {
    expected: number | null
    actual: number | null
    incremental: number | null
  }
  /**
   * Installs that took this release through the auto-updater, estimated as the
   * downloads above the pre-release pace in the first days after publish. The
   * landing page and winget hand out the same files, so a release announcement
   * that brings new visitors inflates it, while installs not launched within the
   * window are missed. Null for a pre-release, which the updater never serves.
   */
  installBase: {
    /** Days after publish the estimate covers, capped at the update window. */
    windowDays: number | null
    /** Installer and updater downloads above the pre-release pace in the window. */
    updatedInstalls: number | null
    /** latest.json downloads per day over the same window. */
    checksPerDay: number | null
    /** Startup update checks per updated install per day. */
    checksPerInstall: number | null
  }
  usageActivity: {
    /** Elapsed days both releases are compared over; shorter than `day` when the releases are close together. */
    comparedDays: number | null
    currentPerDay: number | null
    previousPerDay: number | null
    changePercent: number | null
  }
  /** Installer downloads per day from the baseline window through the evaluation end. */
  dailySeries: ReleaseEffectDailyPoint[]
  baselineStartDate: string
  /** latest.json downloads per day across releases, from the previous release onward. */
  activitySeries: ReleaseEffectDailyPoint[]
  markers: ReleaseEffectMarker[]
}

/**
 * macOS downloads split by how they were fetched. The dmg is only ever
 * downloaded by hand (landing page or GitHub), and the .app.tar.gz only by the
 * auto-updater, so unlike Windows, where the landing page, winget and the
 * updater all hand out the same MSI, the two can be told apart.
 */
export interface MacosUpdateSplit {
  /** dmg downloads: manual downloads. */
  manual: ActivitySeries
  /** .app.tar.gz downloads: auto-updates. */
  updates: ActivitySeries
  /** Share of updates in the period, or null without either. */
  updateShare: number | null
}

export interface StaleReleaseItem {
  tag: string
  url: string
  /** The stable release that replaced it. */
  supersededBy: string
  /** First interval start date on which the successor was out all day. */
  supersededFrom: string
  /** Installer downloads in the period after it was superseded. */
  downloads: number
  /** Installer downloads in the last 7 days. */
  recentDownloads: number
  platforms: { key: Platform; label: string; downloads: number }[]
}

/**
 * Installer downloads of stable releases that a newer stable release had
 * already replaced. The updater always fetches the newest release, so these
 * come from links that name a fixed version: a landing page not yet rebuilt, a
 * winget manifest not yet bumped, or someone picking an old version on purpose.
 */
export interface StaleLinkDownloads {
  downloads: number
  /** Share of all stable installer downloads in the period, or null without any. */
  share: number | null
  /** Downloads per day over the last 7 days. */
  recentPerDay: number
  releases: StaleReleaseItem[]
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
  repoStats: RepoStats
  series: SeriesPoint[]
  releaseEvents: ReleaseEvent[]
  platformSeries: PlatformSeriesItem[]
  platformBreakdown: BreakdownItem[]
  architectureBreakdown: BreakdownItem[]
  releaseBreakdown: ReleaseBreakdownItem[]
  adoptionCurves: AdoptionCurve[]
  releaseEffect: ReleaseEffect | null
  topAssets: AssetBreakdownItem[]
  launchActivity: LaunchActivity
  macosUpdateSplit: MacosUpdateSplit
  staleLinks: StaleLinkDownloads
  latestVersionShare: number | null
  latestVersionTag: string | null
  latestVersionPublishedAt: string | null
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
