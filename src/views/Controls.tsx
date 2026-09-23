import { CACHE_BUST_PARAM, dashboardHref } from '../lib/query'
import type { ChannelFilter, DashboardPageQuery, DashboardQuery, ScopeFilter } from '../types'

const REFRESH_ICON_PATH = 'M20 11a8 8 0 1 0 1 4M20 4v7h-7'

const DAY_OPTIONS: { value: DashboardQuery['days']; label: string }[] = [
  { value: 7, label: '7日' },
  { value: 30, label: '30日' },
  { value: 90, label: '90日' },
  { value: 365, label: '1年' },
]

const CHANNEL_OPTIONS: { value: ChannelFilter; label: string }[] = [
  { value: 'stable', label: '安定版のみ' },
  { value: 'all', label: 'プレリリース込み' },
]

const SCOPE_OPTIONS: { value: ScopeFilter; label: string }[] = [
  { value: 'installers', label: 'インストーラー' },
  { value: 'distribution', label: '配布物全体' },
  { value: 'all', label: '全アセット' },
]

// Every filter is a plain link carrying the whole query with one dimension
// swapped, which is what lets the dashboard stay a server-rendered document
// with no client-side script driving it.
function Segmented<T extends string | number>({
  label,
  groupClass,
  options,
  current,
  href,
}: {
  label: string
  groupClass: string
  options: { value: T; label: string }[]
  current: T
  href: (value: T) => string
}) {
  return (
    <div class={`control-group ${groupClass}`}>
      <span class="control-label">{label}</span>
      <nav class="segmented" aria-label={label}>
        {options.map((option) => {
          const active = option.value === current
          return (
            <a
              href={href(option.value)}
              class={active ? 'active' : undefined}
              aria-current={active ? 'true' : undefined}
            >
              {option.label}
            </a>
          )
        })}
      </nav>
    </div>
  )
}

export function Controls({ query, nonce }: { query: DashboardPageQuery; nonce: number }) {
  const trafficValues =
    query.traffic === undefined ? [] : query.traffic.length === 0 ? [''] : query.traffic

  return (
    <section class="control-panel" aria-label="表示条件">
      <Segmented
        label="期間"
        groupClass="range-control"
        options={DAY_OPTIONS}
        current={query.days}
        href={(days) => dashboardHref(query, { days })}
      />
      <Segmented
        label="チャンネル"
        groupClass="filter-control"
        options={CHANNEL_OPTIONS}
        current={query.channel}
        href={(channel) => dashboardHref(query, { channel })}
      />
      <Segmented
        label="集計対象"
        groupClass="filter-control"
        options={SCOPE_OPTIONS}
        current={query.scope}
        href={(scope) => dashboardHref(query, { scope })}
      />
      <form class="refresh-form" method="get" action="/">
        <input type="hidden" name="days" value={query.days} />
        <input type="hidden" name="channel" value={query.channel} />
        <input type="hidden" name="scope" value={query.scope} />
        {trafficValues.map((value) => (
          <input type="hidden" name="traffic" value={value} />
        ))}
        <input type="hidden" name={CACHE_BUST_PARAM} value={nonce} />
        <button class="refresh-button" type="submit" aria-label="最新データを再取得">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={REFRESH_ICON_PATH} />
          </svg>
          更新
        </button>
      </form>
    </section>
  )
}
