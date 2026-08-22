import { describe, expect, it } from 'vitest'
import { coerceDashboardQuery, dashboardHref, parseDashboardQuery } from '../src/lib/query'
import type { AssetBreakdownItem, DashboardQuery, DashboardResponse } from '../src/types'
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
    expect(html).toContain('新規 vs 更新')
    expect(html).toContain('最新バージョン比率')
    expect(html).toContain('scope）設定の影響を受けません')
    expect(html).toContain('リリース採用曲線')
    expect(html).toContain('v1.9.2 · Day 30')
    expect(html).toContain('/api/export.csv?days=90&amp;channel=all&amp;scope=all')
    expect(html).toContain('/api/dashboard?days=90&amp;channel=all&amp;scope=all')
    expect(html).toContain('曜日パターン')
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
