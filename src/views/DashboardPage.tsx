import { architectureLabel, platformLabel } from '../lib/assets'
import { BASELINE_DAYS, EVALUATION_WINDOW_DAYS } from '../lib/release-effect'
import type {
  AssetBreakdownItem,
  DashboardInsight,
  DashboardPageQuery,
  DashboardQuery,
  DashboardResponse,
  EmptyDashboardResponse,
  ReleaseEffect,
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
  ReleaseEffectActivityChart,
  ReleaseEffectDailyChart,
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
  formatSigned,
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

type SignalTone = 'positive' | 'negative' | undefined

function signalTone(value: number | null, neutral = 0): SignalTone {
  if (value === null) return undefined
  return value >= neutral ? 'positive' : 'negative'
}

function EffectSignal({
  label,
  value,
  tone,
  note,
  hint,
}: {
  label: string
  value: string
  tone?: SignalTone
  note: string
  hint: string
}) {
  return (
    <article class="effect-signal">
      <span class="effect-signal-label">{label}</span>
      <strong class={tone ? `effect-signal-value ${tone}` : 'effect-signal-value'}>{value}</strong>
      <p class="effect-signal-note">{note}</p>
      <p class="effect-signal-hint">{hint}</p>
    </article>
  )
}

// Signals stay "—" rather than falling back to a partial comparison. This says
// why, so an empty card reads as a data condition and not as a broken metric.
function unavailableNote(effect: ReleaseEffect, needsPrevious: boolean): string {
  if (effect.day < 1) return '公開直後のため、比較できるスナップショットがまだありません'
  if (needsPrevious && effect.previousRelease === null) return '比較できる前回リリースがありません'
  return 'スナップショットの欠損などで同じ条件の比較ができません'
}

function ReleaseEffectSignals({ effect }: { effect: ReleaseEffect }) {
  const { adoptionVelocity, releaseLift, incrementalDownloads, usageActivity } = effect
  const previous = effect.previousRelease?.tag ?? '前回'
  const day = `Day ${effect.day}`

  let adoptionNote = unavailableNote(effect, true)
  if (adoptionVelocity.current !== null && adoptionVelocity.previous !== null) {
    adoptionNote =
      adoptionVelocity.changePercent === null
        ? `${previous} は ${day} 時点で 0 件のため、割合を出せません`
        : `${effect.release.tag} ${formatNumber(adoptionVelocity.current)} 件 / ${previous} ${formatNumber(adoptionVelocity.previous)} 件（${day} 時点）`
  }

  let liftNote = unavailableNote(effect, false)
  if (releaseLift.baselinePerDay !== null && releaseLift.postPerDay !== null) {
    liftNote =
      releaseLift.multiple === null
        ? `公開前 ${BASELINE_DAYS} 日平均が 0 件のため、倍率を出せません`
        : `公開前 ${BASELINE_DAYS} 日平均 ${formatDecimal(releaseLift.baselinePerDay)} 件/日 → 公開後 ${formatDecimal(releaseLift.postPerDay)} 件/日`
  }

  let incrementalNote = unavailableNote(effect, false)
  if (incrementalDownloads.expected !== null && incrementalDownloads.actual !== null) {
    incrementalNote = `通常ペースなら約 ${formatNumber(incrementalDownloads.expected)} 件 / 実績 ${formatNumber(incrementalDownloads.actual)} 件（${effect.day} 日間）`
  }

  let usageNote =
    effect.activitySeries.length === 0
      ? 'latest.json のダウンロード履歴がありません'
      : unavailableNote(effect, true)
  if (usageActivity.currentPerDay !== null && usageActivity.previousPerDay !== null) {
    usageNote =
      usageActivity.changePercent === null
        ? `${previous} の同期間が 0 件/日のため、割合を出せません`
        : `${formatDecimal(usageActivity.currentPerDay)} 件/日 / ${previous} ${formatDecimal(usageActivity.previousPerDay)} 件/日（${usageActivity.comparedDays === effect.day ? day : `公開後 ${usageActivity.comparedDays} 日間`}）`
  }

  return (
    <div class="effect-signals">
      <EffectSignal
        label="採用速度"
        value={
          adoptionVelocity.changePercent === null
            ? '—'
            : `${formatSigned(adoptionVelocity.changePercent)}%`
        }
        tone={signalTone(adoptionVelocity.changePercent)}
        note={adoptionNote}
        hint="前回リリースと公開後の同じ経過日数で比べた installer 取得数"
      />
      <EffectSignal
        label="Release Lift"
        value={releaseLift.multiple === null ? '—' : `${formatDecimal(releaseLift.multiple)}x`}
        tone={signalTone(releaseLift.multiple, 1)}
        note={liftNote}
        hint="公開前の通常ペースに対する、公開後の 1 日あたり installer 取得数"
      />
      <EffectSignal
        label="Incremental Downloads"
        value={
          incrementalDownloads.incremental === null
            ? '—'
            : formatSigned(incrementalDownloads.incremental, 0)
        }
        tone={signalTone(incrementalDownloads.incremental)}
        note={incrementalNote}
        hint="通常ペースを超えたダウンロード数。新規ユーザー数ではありません"
      />
      <EffectSignal
        label="利用活動シグナル"
        value={
          usageActivity.changePercent === null
            ? '—'
            : `${formatSigned(usageActivity.changePercent)}%`
        }
        tone={signalTone(usageActivity.changePercent)}
        note={usageNote}
        hint="起動時の更新チェック（latest.json 取得）の 1 日あたり件数。ユニークユーザー数ではありません"
      />
    </div>
  )
}

function ReleaseEffectPanel({
  effect,
  formatter,
}: {
  effect: ReleaseEffect | null
  formatter: Formatter
}) {
  return (
    <section class="panel release-effect-panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Growth signals</p>
          <h2>リリース効果</h2>
        </div>
        {effect ? (
          <div class="effect-release-tag">
            <strong>{`${effect.release.tag} · Day ${effect.day}`}</strong>
            <span>
              {effect.previousRelease ? `比較対象 ${effect.previousRelease.tag}` : '比較対象なし'}
              {effect.release.prerelease ? ' · pre-release' : ''}
            </span>
          </div>
        ) : null}
      </div>
      {effect ? (
        <>
          <ReleaseEffectSignals effect={effect} />
          <div class="effect-charts">
            <section>
              <div class="repo-chart-heading">
                <h3>リリース前後の日次 installer DL</h3>
                <span class="effect-legend">
                  <i class="before" /> 公開前 <i /> 公開後 <i class="baseline" /> 公開前平均
                </span>
              </div>
              <ReleaseEffectDailyChart effect={effect} formatter={formatter} />
            </section>
            <section>
              <div class="repo-chart-heading">
                <h3>起動時 update check（latest.json）</h3>
                <span class="effect-legend">
                  <i class="activity" /> 日次
                </span>
              </div>
              <ReleaseEffectActivityChart effect={effect} formatter={formatter} />
            </section>
          </div>
          {effect.elapsedDays > effect.day ? (
            <p class="panel-description">
              {`公開から ${effect.elapsedDays} 日経過しています。評価は公開後 ${EVALUATION_WINDOW_DAYS} 日（${formatter.date(effect.evaluatedDate)}）までを対象にしています。`}
            </p>
          ) : null}
          {effect.releaseLift.baselineIncludesRelease ? (
            <p class="panel-description">
              {`公開前 ${BASELINE_DAYS} 日間に別のリリースが含まれるため、通常ペースが高めに出ている可能性があります。`}
            </p>
          ) : null}
          <p class="panel-description">
            ダウンロード数はユニークユーザー数ではありません。利用活動シグナルはアプリ起動時の更新チェック数を用いた
            proxy で、稼働ユーザー数や継続率を測定するものではありません。このパネルは installer
            のみを集計し、集計対象（scope）設定の影響を受けません。
          </p>
        </>
      ) : (
        <div class="chart-empty">比較できるリリースがまだありません</div>
      )}
    </section>
  )
}

function RepoStatsPanel({
  stats,
  days,
  query,
  formatter,
}: {
  stats: RepoStats
  days: DashboardQuery['days']
  query: DashboardPageQuery
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
          <RepoStatsCharts
            stats={stats}
            filters={query}
            trafficSelection={query.traffic}
            days={days}
            formatter={formatter}
          />
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
  query: DashboardPageQuery
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

          <RepoStatsPanel
            stats={data.repoStats}
            days={data.meta.days}
            query={query}
            formatter={formatter}
          />

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
                <p class="panel-kicker">Distribution activity</p>
                <h2>配布アクティビティ</h2>
              </div>
              <div class="update-health-legend">
                <span>
                  <i class="installer" /> installer
                </span>
                <span>
                  <i class="updater" /> updater bundle
                </span>
              </div>
            </div>
            <div class="update-health-totals">
              <div>
                <span>installer 取得数（期間合計）</span>
                <strong>{formatNumber(data.updateHealth.installer.periodDownloads)}</strong>
              </div>
              <div>
                <span>updater bundle 取得数（期間合計）</span>
                <strong>{formatNumber(data.updateHealth.updater.periodDownloads)}</strong>
              </div>
            </div>
            <UpdateHealthChart
              health={data.updateHealth}
              days={data.meta.days}
              formatter={formatter}
            />
            <p class="panel-description">
              installer と updater bundle
              （自動更新用の配布ファイル）の取得数を、ファイル種別ごとに比べています。どちらも配布ファイルの取得数であり、installer
              は新規ユーザー数、updater bundle
              は稼働中ユーザー数や継続率を直接表すものではありません。起動時の更新チェックは「リリース効果」の利用活動シグナルを参照してください。このパネルは集計対象（scope）設定の影響を受けません。
            </p>
          </section>

          <ReleaseEffectPanel effect={data.releaseEffect} formatter={formatter} />

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

export function ErrorPage({ query, nonce }: { query: DashboardPageQuery; nonce: number }) {
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
