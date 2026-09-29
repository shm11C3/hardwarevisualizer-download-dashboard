import { describe, expect, it } from 'vitest'
import { coerceDashboardQuery, dashboardHref, parseDashboardQuery } from '../src/lib/query'
import type {
  AssetBreakdownItem,
  DashboardQuery,
  DashboardResponse,
  ReleaseEffect,
} from '../src/types'
import { DashboardPage } from '../src/views/DashboardPage'
import { createFormatter } from '../src/views/format'
import { previewDashboard } from './fixtures/dashboard'

const DEFAULTS: DashboardQuery = { days: 30, channel: 'stable', scope: 'installers' }

function render(data: DashboardResponse, query: DashboardQuery = DEFAULTS): Promise<string> {
  return Promise.resolve(<DashboardPage data={data} query={query} nonce={0} />).then(String)
}

describe('dashboard query', () => {
  it('overrides one dimension and keeps the rest', () => {
    expect(dashboardHref(DEFAULTS, { days: 90 })).toBe('/?days=90&channel=stable&scope=installers')
    expect(dashboardHref(DEFAULTS, { channel: 'all' })).toBe(
      '/?days=30&channel=all&scope=installers',
    )
  })

  it('falls back to defaults for the page but rejects them for the API', () => {
    const url = new URL('https://example.com/?days=13&channel=nightly&scope=everything')
    expect(coerceDashboardQuery(url)).toEqual(DEFAULTS)
    expect(parseDashboardQuery(url)).toBeNull()
  })

  it('ignores the cache-busting parameter when reading filters', () => {
    const url = new URL('https://example.com/?days=7&channel=all&scope=all&t=1234')
    expect(coerceDashboardQuery(url)).toEqual({ days: 7, channel: 'all', scope: 'all' })
  })
})

describe('formatting', () => {
  const formatter = createFormatter('Asia/Tokyo')

  it('renders a snapshot date key without shifting a day', () => {
    expect(formatter.date('2026-08-22')).toBe('2026年8月22日')
    expect(formatter.chartLabel('2026-01-01', false)).toBe('1/1')
  })

  it('renders a full ISO timestamp in the configured zone', () => {
    // 2026-08-21T15:10Z is 2026-08-22 00:10 in Asia/Tokyo.
    expect(formatter.dateTime('2026-08-21T15:10:00.000Z')).toBe('8月22日 00:10')
  })

  it('renders a dash for missing or unparseable values', () => {
    expect(formatter.date(null)).toBe('—')
    expect(formatter.date('not-a-date')).toBe('—')
  })
})

describe('DashboardPage', () => {
  it('labels daily deltas by the interval start while keeping cumulative snapshots dated', async () => {
    const data = previewDashboard(new URL('https://example.com/?days=7'))
    const html = await render({
      ...data,
      summary: {
        ...data.summary,
        latestDayDownloads: 65,
        latestDayDate: '2026-08-24',
      },
      series: [
        {
          date: '2026-08-25',
          intervalStartDate: '2026-08-24',
          totalDownloads: 6_864,
          dailyDownloads: 65,
          observed: true,
        },
      ],
      releaseEvents: [
        {
          tag: 'v1.10.1',
          label: 'v1.10.1',
          prerelease: false,
          url: 'https://example.com/releases/v1.10.1',
          date: '2026-08-24',
        },
      ],
    })

    expect(html).toContain('<title>2026-08-24: 65 件</title>')
    expect(html).toContain('<title>2026-08-25: 6,864 件</title>')
    expect(html).toContain('2026年8月24日の増分')
    expect(html).toContain('class="release-marker"')
  })

  it('renders one bar per observed day and marks the active filters', async () => {
    const query: DashboardQuery = { days: 90, channel: 'all', scope: 'all' }
    const data = previewDashboard(new URL('https://example.com/?days=90&channel=all&scope=all'))
    const html = await render(data, query)

    expect(html.match(/class="chart-bar"/g)).toHaveLength(90)
    expect(html).toContain('OS別推移')
    expect(html).toContain('class="release-marker"')
    expect(html).toContain('<a href="/?days=90&amp;channel=all&amp;scope=all" class="active"')
    expect(html).not.toContain('skeleton-text')
    expect(html).not.toContain('<script')
    expect(html).toContain('アーキテクチャ別')
    expect(html).toContain('aria-label="アーキテクチャ別ダウンロード構成"')
    expect(html).toContain('配布アクティビティ')
    expect(html).not.toContain('新規 vs 更新')
    expect(html).toContain('最新バージョン比率')
    expect(html).toContain('scope）設定の影響を受けません')
    expect(html).toContain('リリース採用曲線')
    expect(html).toContain('v1.9.2 · Day 30')
    expect(html).toContain('/api/export.csv?days=90&amp;channel=all&amp;scope=all')
    expect(html).toContain('/api/dashboard?days=90&amp;channel=all&amp;scope=all')
    expect(html).toContain('曜日パターン')
    expect(html).toContain('リポジトリの注目度')
    expect(html).toContain('最新スター')
    expect(html).toContain('aria-label="スター増分の日次推移"')
    expect(html).toContain('aria-label="views と clones の日次推移"')
    expect(html).toContain('views uniques')
    expect(html).toContain('clones uniques')
  })

  it('renders the repository-stats empty state', async () => {
    const data = previewDashboard(new URL('https://example.com/'))
    const html = await render({
      ...data,
      repoStats: { stars: { latest: null, series: [] }, traffic: [] },
    })

    expect(html).toContain('リポジトリの注目度')
    expect(html).toContain('スター・トラフィックの収集を開始すると表示されます')
    expect(html).not.toContain('aria-label="スター増分の日次推移"')
  })

  it('keeps star metrics visible and explains when traffic is unavailable', async () => {
    const data = previewDashboard(new URL('https://example.com/'))
    const html = await render({ ...data, repoStats: { ...data.repoStats, traffic: [] } })

    expect(html).toContain('aria-label="スター増分の日次推移"')
    expect(html).toContain('トラフィックは GITHUB_TOKEN に push 権限が必要です')
    expect(html).not.toContain('aria-label="views と clones の日次推移"')
  })

  it('renders the release effect between the distribution and adoption panels', async () => {
    const data = previewDashboard(new URL('https://example.com/'))
    const html = await render(data)

    expect(html).toContain('Growth signals')
    expect(html).toContain('リリース効果')
    expect(html).toContain('v1.9.2 · Day 30')
    expect(html).toContain('比較対象 v1.9.1')
    for (const label of ['採用速度', 'Release Lift', 'Incremental Downloads', '利用活動シグナル']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('+31.3%')
    expect(html).toContain('2.2x')
    expect(html).toContain('+1,455')
    expect(html).toContain('+24.9%')
    expect(html).toContain(
      'aria-label="リリース前後の日次 installer ダウンロードと公開前ベースライン"',
    )
    expect(html).toContain('aria-label="latest.json の日次ダウンロード推移"')
    expect(html).toContain('公開から 32 日経過しています')
    expect(html.indexOf('配布アクティビティ')).toBeLessThan(html.indexOf('リリース効果'))
    expect(html.indexOf('リリース効果')).toBeLessThan(html.indexOf('リリース採用曲線'))
  })

  it('states that the signals are proxies and not user counts', async () => {
    const html = await render(previewDashboard(new URL('https://example.com/')))

    expect(html).toContain('ダウンロード数はユニークユーザー数ではありません')
    expect(html).toContain('アプリ起動時の更新チェック数を用いた')
    expect(html).toContain('新規ユーザー数ではありません')
    expect(html).toContain('ユニークユーザー数ではありません')
    // Nothing on the page may present these as measured values.
    expect(html).not.toMatch(/DAU|MAU|retention|Acquisition/)
    expect(html).not.toContain('新規獲得')
    expect(html).not.toContain('稼働中インストール数の近似')
  })

  it('no longer reads the distribution panel as new versus returning users', async () => {
    const html = await render(previewDashboard(new URL('https://example.com/')))

    expect(html).toContain('Distribution activity')
    expect(html).toContain('updater bundle')
    expect(html).toContain('稼働中ユーザー数や継続率を直接表すものではありません')
  })

  it('shows a dash and the reason when a signal cannot be compared', async () => {
    const data = previewDashboard(new URL('https://example.com/'))
    const effect: ReleaseEffect = {
      ...(data.releaseEffect as ReleaseEffect),
      previousRelease: null,
      day: 0,
      elapsedDays: 0,
      adoptionVelocity: { current: null, previous: null, changePercent: null },
      releaseLift: {
        baselinePerDay: null,
        postPerDay: null,
        multiple: null,
        baselineIncludesRelease: false,
      },
      incrementalDownloads: { expected: null, actual: null, incremental: null },
      usageActivity: {
        comparedDays: null,
        currentPerDay: null,
        previousPerDay: null,
        changePercent: null,
      },
      dailySeries: [],
      activitySeries: [],
    }
    const html = await render({ ...data, releaseEffect: effect })

    expect(html).toContain('v1.9.2 · Day 0')
    expect(html).toContain('比較対象なし')
    expect(html).toContain('公開直後のため、比較できるスナップショットがまだありません')
    expect(html).toContain('latest.json のダウンロード履歴がありません')
    expect(html).toContain('リリース前後の日次データがまだありません')
    expect(html).toContain('latest.json の日次取得数を表示できません')
    expect(html.match(/class="effect-signal-value">—</g)).toHaveLength(4)
    expect(html).not.toContain('公開から')
  })

  it('explains why a lift cannot be computed from a zero baseline', async () => {
    const data = previewDashboard(new URL('https://example.com/'))
    const base = data.releaseEffect as ReleaseEffect
    const html = await render({
      ...data,
      releaseEffect: {
        ...base,
        releaseLift: {
          baselinePerDay: 0,
          postPerDay: 90,
          multiple: null,
          baselineIncludesRelease: true,
        },
        usageActivity: {
          comparedDays: 30,
          currentPerDay: 120,
          previousPerDay: 0,
          changePercent: null,
        },
        release: { ...base.release, prerelease: true },
      },
    })

    expect(html).toContain('公開前 7 日平均が 0 件のため、倍率を出せません')
    expect(html).toContain('公開前 7 日間に別のリリースが含まれる')
    expect(html).toContain('の同期間が 0 件/日のため、割合を出せません')
    expect(html).toContain('pre-release')
  })

  it('names the shared days when update checks are compared over a shorter period', async () => {
    const data = previewDashboard(new URL('https://example.com/'))
    const base = data.releaseEffect as ReleaseEffect
    const html = await render({
      ...data,
      releaseEffect: {
        ...base,
        usageActivity: {
          comparedDays: 12,
          currentPerDay: 120,
          previousPerDay: 100,
          changePercent: 20,
        },
      },
    })

    expect(html).toContain('120 件/日 / v1.9.1 100 件/日（公開後 12 日間）')
    expect(html).toContain('+20%')
  })

  it('marks a slower release as negative', async () => {
    const data = previewDashboard(new URL('https://example.com/'))
    const base = data.releaseEffect as ReleaseEffect
    const html = await render({
      ...data,
      releaseEffect: {
        ...base,
        adoptionVelocity: { current: 100, previous: 200, changePercent: -50 },
        releaseLift: { ...base.releaseLift, multiple: 0.7 },
        incrementalDownloads: { expected: 126, actual: 90, incremental: -36 },
      },
    })

    expect(html).toContain('effect-signal-value negative">-50%<')
    expect(html).toContain('effect-signal-value negative">0.7x<')
    expect(html).toContain('effect-signal-value negative">-36<')
  })

  it('renders an empty release effect panel without a release', async () => {
    const data = previewDashboard(new URL('https://example.com/'))
    const html = await render({ ...data, releaseEffect: null })

    expect(html).toContain('リリース効果')
    expect(html).toContain('比較できるリリースがまだありません')
    expect(html).not.toContain('effect-signal-value')
  })

  it('renders the adoption-curve empty state when no releases are comparable', async () => {
    const data = previewDashboard(new URL('https://example.com/'))
    const html = await render({ ...data, adoptionCurves: [] })

    expect(html).toContain('比較できるリリースがまだありません')
  })

  it('escapes hostile asset names and drops non-https asset links', async () => {
    const base = previewDashboard(new URL('https://example.com/'))
    const hostile: AssetBreakdownItem = {
      ...(base.topAssets[0] as AssetBreakdownItem),
      name: '<img src=x onerror=alert(1)>',
      url: 'javascript:alert(1)',
    }
    const html = await render({ ...base, topAssets: [hostile] })

    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('javascript:alert')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('href="#"')
  })

  it('renders the empty state instead of charts when there is no history', async () => {
    const html = await Promise.resolve(
      <DashboardPage
        data={{
          status: 'empty',
          meta: {
            owner: 'shm11C3',
            repo: 'HardwareVisualizer',
            generatedAt: '2026-08-22T00:00:00.000Z',
            timeZone: 'Asia/Tokyo',
            days: 30,
            channel: 'stable',
            scope: 'installers',
            lastCollection: null,
          },
          message: 'まだダウンロード履歴がありません。',
        }}
        query={DEFAULTS}
        nonce={0}
      />,
    ).then(String)

    expect(html).toContain('empty-state')
    expect(html).toContain('まだ履歴がありません')
    expect(html).not.toContain('chart-bar')
  })
})
