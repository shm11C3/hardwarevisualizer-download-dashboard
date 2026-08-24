import { architectureLabel, platformLabel } from '../lib/assets'
import type {
  AssetBreakdownItem,
  DashboardInsight,
  DashboardQuery,
  DashboardResponse,
  EmptyDashboardResponse,
  RepoStats,
} from '../types'
import {
  AdoptionCurveChart,
  CumulativeChart,
  DailyChart,
  PLATFORM_COLORS,
  PlatformBreakdown,
  PlatformTrendChart,
  ReleaseBreakdown,
  RepoStatsCharts,
  UpdateHealthChart,
  WeekdayPattern,
} from './Charts'
import { Controls } from './Controls'
import {
  createFormatter,
  type Formatter,
  formatDecimal,
  formatNumber,
  periodText,
  safeUrl,
} from './format'

type StatusKind = 'ready' | 'error' | 'neutral'

function Hero({ status }: { status: { kind: StatusKind; message: string } }) {
  const statusClass = status.kind === 'neutral' ? 'data-status' : `data-status ${status.kind}`
  return (
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">
          <span /> GitHub Release Intelligence
        </p>
        <h1>
          ダウンロードの動きを、
          <br />
          <em>数字から読み解く。</em>
        </h1>
        <p class="hero-description">
          GitHub Release の累積値を毎日保存し、増分、推移、OS
          構成、リリースごとの反応を可視化します。
        </p>
      </div>
      <div class={statusClass} aria-live="polite">
        <span class="status-dot" />
        <span>{status.message}</span>
      </div>
    </section>
  )
}

function KpiCard({
  title,
  icon,
  value,
  valueClass,
  note,
  featured,
}: {
  title: string
  icon: string
  value: string
  valueClass?: string | undefined
  note: string
  featured?: boolean | undefined
}) {
  return (
    <article class={featured ? 'kpi-card featured' : 'kpi-card'}>
      <div class="kpi-heading">
        <span>{title}</span>
        <span class="metric-icon">{icon}</span>
      </div>
      <strong class={valueClass ? `kpi-value ${valueClass}` : 'kpi-value'}>{value}</strong>
      <p>{note}</p>
    </article>
  )
}

function KpiGrid({ data, formatter }: { data: DashboardResponse; formatter: Formatter }) {
  const { summary, meta } = data

  let growthValue = '—'
  let growthClass: string | undefined
  let growthNote =
    summary.previousPeriodDownloads === 0 && summary.periodDownloads > 0
      ? '前期間は 0 件'
      : '比較期間のデータ不足'

  if (summary.growthPercent !== null) {
    const prefix = summary.growthPercent > 0 ? '+' : ''
    growthValue = `${prefix}${formatDecimal(summary.growthPercent)}%`
    growthClass = summary.growthPercent >= 0 ? 'positive' : 'negative'
    growthNote = `前期間 ${formatNumber(summary.previousPeriodDownloads)} 件`
  }

  return (
    <section class="kpi-grid" aria-label="主要指標">
      <KpiCard
        featured
        title="累計ダウンロード"
        icon="Σ"
        value={formatNumber(summary.totalDownloads)}
        note={`${formatter.date(meta.trackingSince)} から追跡`}
      />
      <KpiCard
        title={periodText(meta.days)}
        icon="↓"
        value={formatNumber(summary.periodDownloads)}
        note={`${formatter.date(meta.effectiveBaselineDate)} 以降の増分`}
      />
      <KpiCard
        title="1日平均"
        icon="Ø"
        value={formatNumber(summary.averagePerDay, 1)}
        note="観測できた期間の日数で算出"
      />
      <KpiCard
        title="前期間比"
        icon="↗"
        value={growthValue}
        valueClass={growthClass}
        note={growthNote}
      />
    </section>
  )
}

function RepoStatsPanel({
  stats,
  days,
  formatter,
}: {
  stats: RepoStats
  days: DashboardQuery['days']
  formatter: Formatter
}) {
  const hasData =
    stats.stars.latest !== null || stats.stars.series.length > 0 || stats.traffic.length > 0

  return (
    <article class="panel repo-stats-panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Repository attention</p>
          <h2>リポジトリの注目度</h2>
        </div>
        <div class="repo-latest-stars">
          <span>最新スター</span>
          <strong>
            {stats.stars.latest === null ? '—' : `★ ${formatNumber(stats.stars.latest)}`}
          </strong>
        </div>
      </div>
      {hasData ? (
        <>
          <RepoStatsCharts stats={stats} days={days} formatter={formatter} />
          {stats.traffic.length === 0 ? (
            <p class="repo-traffic-note">トラフィックは GITHUB_TOKEN に push 権限が必要です</p>
          ) : null}
        </>
      ) : (
        <div class="repo-stats-empty">スター・トラフィックの収集を開始すると表示されます</div>
      )}
    </article>
  )
}

function AssetTable({ items }: { items: AssetBreakdownItem[] }) {
  return (
    <section class="panel assets-panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Distribution files</p>
          <h2>配布ファイル上位</h2>
        </div>
        <span class="panel-meta">選択期間</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ファイル</th>
              <th>リリース</th>
              <th>OS</th>
              <th>アーキテクチャ</th>
              <th class="number-cell">期間</th>
              <th class="number-cell">累計</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td class="empty-table-cell" colspan={6}>
                  対象データがありません
                </td>
              </tr>
            ) : (
              items.slice(0, 10).map((item) => (
                <tr>
                  <td class="asset-name-cell">
                    <a href={safeUrl(item.url)} target="_blank" rel="noreferrer" title={item.name}>
                      {item.name}
                    </a>
                  </td>
                  <td>{item.tag}</td>
                  <td>
                    <span class="platform-badge">{platformLabel(item.platform)}</span>
                  </td>
                  <td>{architectureLabel(item.architecture)}</td>
                  <td class="number-cell">{formatNumber(item.downloads)}</td>
                  <td class="number-cell">{formatNumber(item.totalDownloads)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const INSIGHT_ICONS: Record<DashboardInsight['kind'], string> = {
  growth: '↗',
  platform: '⌘',
  release: '◇',
  peak: '⌁',
  data: '✓',
  latest: '◎',
  milestone: '◆',
  streak: '∞',
}

function exportHref(path: string, query: DashboardQuery): string {
  const params = new URLSearchParams({
    days: String(query.days),
    channel: query.channel,
    scope: query.scope,
  })
  return `${path}?${params.toString()}`
}

function Insights({ items }: { items: DashboardInsight[] }) {
  return (
    <section class="insights-section">
      <div class="section-heading">
        <p class="panel-kicker">Signals</p>
        <h2>データから見えること</h2>
      </div>
      <div class="insight-grid">
        {items.map((item) => (
          <article class="insight-card">
            <div class="insight-icon">{INSIGHT_ICONS[item.kind] ?? '·'}</div>
            <span>{item.title}</span>
            <strong title={item.value}>{item.value}</strong>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function MethodNote({ trackingSince }: { trackingSince: string }) {
  return (
    <aside class="method-note">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5m0-8h.01" />
      </svg>
      <p>
        {`GitHub が提供するアセット別の累積ダウンロード数を日次保存し、前回値との差を算出しています。追跡開始日は ${trackingSince} です。初回収集以前の日次履歴は復元できず、欠損日をまたぐ差分は日次グラフから除外します。`}
      </p>
    </aside>
  )
}

function statusFor(
  data: DashboardResponse | EmptyDashboardResponse,
  formatter: Formatter,
): { kind: StatusKind; message: string } {
  const collection = data.meta.lastCollection

  if (data.status === 'empty') {
    return collection?.status === 'failed'
      ? { kind: 'error', message: '初回収集に失敗' }
      : { kind: 'neutral', message: 'まだ履歴がありません' }
  }

  if (collection?.status === 'failed') {
    const at = formatter.dateTime(collection.finishedAt ?? collection.startedAt)
    return { kind: 'error', message: `最終収集でエラー · ${at}` }
  }

  if (collection) {
    const at = formatter.dateTime(collection.finishedAt ?? collection.startedAt)
    return { kind: 'ready', message: `最終収集 ${at}` }
  }

  return {
    kind: 'ready',
    message: `最新スナップショット ${formatter.date(data.meta.latestSnapshotDate)}`,
  }
}

export function DashboardPage({
  data,
  query,
  nonce,
}: {
  data: DashboardResponse | EmptyDashboardResponse
  query: DashboardQuery
  nonce: number
}) {
  const formatter = createFormatter(data.meta.timeZone)
  const status = statusFor(data, formatter)

  return (
    <>
      <Hero status={status} />
      <Controls query={query} nonce={nonce} />
      {data.status === 'empty' ? (
        <section class="empty-state">
          <div class="empty-icon">↘</div>
          <h2>収集を開始すると、ここに推移が表示されます</h2>
          <p>{data.message}</p>
          <code>POST /api/admin/collect</code>
        </section>
      ) : (
        <div>
          <KpiGrid data={data} formatter={formatter} />

          <section class="chart-grid">
            <article class="panel daily-panel">
              <div class="panel-header">
                <div>
                  <p class="panel-kicker">Velocity</p>
                  <h2>日次ダウンロード</h2>
                </div>
                <div class="daily-panel-tools">
                  <nav class="export-links" aria-label="表示データのエクスポート">
                    <a href={exportHref('/api/export.csv', query)}>CSV</a>
                    <a href={exportHref('/api/dashboard', query)} target="_blank" rel="noreferrer">
                      JSON
                    </a>
                  </nav>
                  <div class="chart-legend">
                    <span class="legend-bar" /> 日次 <span class="legend-line" /> 7日移動平均
                    <span class="legend-release" /> リリース
                  </div>
                </div>
              </div>
              <DailyChart
                series={data.series}
                days={data.meta.days}
                formatter={formatter}
                releaseEvents={data.releaseEvents}
              />
            </article>

            <article class="panel cumulative-panel">
              <div class="panel-header">
                <div>
                  <p class="panel-kicker">Momentum</p>
                  <h2>累積推移</h2>
                </div>
                <span class="panel-meta">{`最新 ${formatter.date(data.meta.latestSnapshotDate)}`}</span>
              </div>
              <CumulativeChart series={data.series} days={data.meta.days} formatter={formatter} />
              <div class="latest-day-stat">
                <span>
                  {data.summary.latestDayDate
                    ? `${formatter.date(data.summary.latestDayDate)}の増分`
                    : '最新日の増分'}
                </span>
                <strong>
                  {data.summary.latestDayDownloads === null
                    ? '—'
                    : `+${formatNumber(data.summary.latestDayDownloads)}`}
                </strong>
              </div>
            </article>
          </section>

          <RepoStatsPanel stats={data.repoStats} days={data.meta.days} formatter={formatter} />

          <article class="panel platform-trend-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Platform velocity</p>
                <h2>OS別推移</h2>
              </div>
              <div class="platform-trend-legend">
                {data.platformSeries.map((item) => (
                  <span>
                    <i style={`--swatch: ${PLATFORM_COLORS[item.key]}`} />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
            <PlatformTrendChart
              items={data.platformSeries}
              days={data.meta.days}
              formatter={formatter}
            />
          </article>

          <section class="panel update-health-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Acquisition &amp; retention proxy</p>
                <h2>新規 vs 更新</h2>
              </div>
              <div class="update-health-legend">
                <span>
                  <i class="installer" /> installer
                </span>
                <span>
                  <i class="updater" /> updater
                </span>
              </div>
            </div>
            <div class="update-health-totals">
              <div>
                <span>installer 期間合計</span>
                <strong>{formatNumber(data.updateHealth.installer.periodDownloads)}</strong>
              </div>
              <div>
                <span>updater 期間合計</span>
                <strong>{formatNumber(data.updateHealth.updater.periodDownloads)}</strong>
              </div>
            </div>
            <UpdateHealthChart
              health={data.updateHealth}
              days={data.meta.days}
              formatter={formatter}
            />
            <p class="panel-description">
              updater
              は自動更新クライアントの取得数で、稼働中インストール数の近似になります。このパネルは集計対象（scope）設定の影響を受けません。
            </p>
          </section>

          <section class="panel adoption-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Release adoption</p>
                <h2>リリース採用曲線</h2>
              </div>
              <span class="panel-meta">公開後 0〜30 日</span>
            </div>
            <AdoptionCurveChart curves={data.adoptionCurves} />
          </section>

          <article class="panel weekday-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Weekly rhythm</p>
                <h2>曜日パターン</h2>
              </div>
              <span class="panel-meta">観測日の平均</span>
            </div>
            <WeekdayPattern series={data.series} />
          </article>

          <section class="detail-grid">
            <article class="panel platform-panel">
              <div class="panel-header">
                <div>
                  <p class="panel-kicker">Audience</p>
                  <h2>OS別構成</h2>
                </div>
              </div>
              <PlatformBreakdown
                items={data.platformBreakdown}
                periodDownloads={data.summary.periodDownloads}
              />
            </article>

            <article class="panel platform-panel">
              <div class="panel-header">
                <div>
                  <p class="panel-kicker">Architecture</p>
                  <h2>アーキテクチャ別</h2>
                </div>
              </div>
              <PlatformBreakdown
                items={data.architectureBreakdown}
                periodDownloads={data.summary.periodDownloads}
                ariaLabel="アーキテクチャ別ダウンロード構成"
              />
            </article>

            <article class="panel release-panel">
              <div class="panel-header">
                <div>
                  <p class="panel-kicker">Release performance</p>
                  <h2>リリース別ダウンロード</h2>
                </div>
                <span class="panel-meta">期間増分</span>
              </div>
              <ReleaseBreakdown items={data.releaseBreakdown} formatter={formatter} />
            </article>
          </section>

          <AssetTable items={data.topAssets} />
          <Insights items={data.insights} />
          <MethodNote trackingSince={formatter.date(data.meta.trackingSince)} />
        </div>
      )}
    </>
  )
}

export function ErrorPage({ query, nonce }: { query: DashboardQuery; nonce: number }) {
  return (
    <>
      <Hero status={{ kind: 'error', message: 'データ取得エラー' }} />
      <Controls query={query} nonce={nonce} />
      <div class="error-banner" role="alert">
        ダウンロード分析データを取得できませんでした。時間をおいて再度お試しください。
      </div>
    </>
  )
}
