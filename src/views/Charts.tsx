import type { BreakdownItem, DashboardQuery, ReleaseBreakdownItem, SeriesPoint } from '../types'
import { type Formatter, formatDecimal, formatNumber, safeUrl } from './format'

interface Point {
  x: number
  y: number
}

function niceMaximum(value: number): number {
  if (value <= 0) return 10
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return nice * magnitude
}

function linePath(points: Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ')
}

function ChartEmpty({ message }: { message: string }) {
  return <div class="chart-empty">{message}</div>
}

interface DailyChartProps {
  series: SeriesPoint[]
  days: DashboardQuery['days']
  formatter: Formatter
}

export function DailyChart({ series, days, formatter }: DailyChartProps) {
  if (!series.length) {
    return (
      <div class="chart-frame">
        <ChartEmpty message="表示できる日次データがありません" />
      </div>
    )
  }

  const width = 900
  const height = 300
  const margin = { top: 12, right: 14, bottom: 36, left: 52 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const values = series.map((point) => point.dailyDownloads ?? 0)
  const maximum = niceMaximum(Math.max(...values, 1))
  const step = innerWidth / Math.max(series.length, 1)
  const barWidth = Math.max(1.2, Math.min(13, step * 0.62))
  const y = (value: number) => margin.top + innerHeight - (value / maximum) * innerHeight

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = (maximum / 4) * index
    return { value, y: y(value) }
  })

  const movingAverage: Point[] = []
  for (let index = 0; index < series.length; index += 1) {
    const windowValues = series
      .slice(Math.max(0, index - 6), index + 1)
      .map((point) => point.dailyDownloads)
      .filter((value): value is number => value !== null)
    if (windowValues.length < Math.min(3, index + 1)) continue
    const average = windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length
    movingAverage.push({ x: margin.left + index * step + step / 2, y: y(average) })
  }

  const labelCount = Math.min(6, series.length)
  const labels = Array.from({ length: labelCount }, (_, index) => {
    const dataIndex = Math.round((index * (series.length - 1)) / Math.max(labelCount - 1, 1))
    return { point: series[dataIndex], x: margin.left + dataIndex * step + step / 2 }
  })

  return (
    <div class="chart-frame">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${days === 365 ? '直近1年' : `直近${days}日`}の日次ダウンロード数`}
      >
        <defs>
          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#9bb2ff" />
            <stop offset="1" stop-color="#5f79db" stop-opacity="0.48" />
          </linearGradient>
        </defs>
        {gridLines.map((line) => (
          <>
            <line
              class="chart-grid-line"
              x1={margin.left}
              x2={width - margin.right}
              y1={line.y}
              y2={line.y}
            />
            <text class="chart-axis-text" x={margin.left - 10} y={line.y + 3} text-anchor="end">
              {formatNumber(line.value)}
            </text>
          </>
        ))}
        {series.map((point, index) => {
          if (point.dailyDownloads === null) return null
          const value = point.dailyDownloads
          const barHeight = Math.max(value > 0 ? 1.5 : 0, (value / maximum) * innerHeight)
          const x = margin.left + index * step + (step - barWidth) / 2
          return (
            <rect
              class="chart-bar"
              x={x.toFixed(2)}
              y={(margin.top + innerHeight - barHeight).toFixed(2)}
              width={barWidth.toFixed(2)}
              height={barHeight.toFixed(2)}
            >
              <title>{`${point.date}: ${formatNumber(value)} 件`}</title>
            </rect>
          )
        })}
        {movingAverage.length > 1 ? <path class="chart-line" d={linePath(movingAverage)} /> : null}
        {labels.map((label) => (
          <text class="chart-axis-text" x={label.x} y={height - 8} text-anchor="middle">
            {formatter.chartLabel(label.point?.date, days === 365)}
          </text>
        ))}
      </svg>
    </div>
  )
}

interface CumulativeChartProps {
  series: SeriesPoint[]
  days: DashboardQuery['days']
  formatter: Formatter
}

export function CumulativeChart({ series, days, formatter }: CumulativeChartProps) {
  const first = series[0]
  const lastPoint = series[series.length - 1]
  if (!first || !lastPoint) {
    return (
      <div class="chart-frame compact">
        <ChartEmpty message="表示できる累積データがありません" />
      </div>
    )
  }

  const width = 500
  const height = 270
  const margin = { top: 18, right: 14, bottom: 34, left: 16 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const totals = series.map((point) => point.totalDownloads)
  const minimum = Math.min(...totals)
  const maximum = Math.max(...totals)
  const range = Math.max(maximum - minimum, 1)
  const points = series.map((point, index) => ({
    x: margin.left + (index / Math.max(series.length - 1, 1)) * innerWidth,
    y: margin.top + innerHeight - ((point.totalDownloads - minimum) / range) * innerHeight,
    date: point.date,
    value: point.totalDownloads,
  }))

  const baseline = margin.top + innerHeight
  const line = linePath(points)
  const last = points[points.length - 1] ?? { x: margin.left, y: baseline, value: 0, date: '' }
  const start = points[0] ?? last
  const area = `${line} L${last.x},${baseline} L${start.x},${baseline} Z`

  return (
    <div class="chart-frame compact">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="累積ダウンロード推移">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#7c9cff" stop-opacity="0.32" />
            <stop offset="1" stop-color="#7c9cff" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line
          class="chart-grid-line"
          x1={margin.left}
          x2={width - margin.right}
          y1={margin.top}
          y2={margin.top}
        />
        <line
          class="chart-grid-line"
          x1={margin.left}
          x2={width - margin.right}
          y1={baseline}
          y2={baseline}
        />
        <path class="cumulative-area" d={area} />
        <path class="cumulative-line" d={line} />
        <circle class="chart-point" cx={last.x} cy={last.y} r="4">
          <title>{`${last.date}: ${formatNumber(last.value)} 件`}</title>
        </circle>
        <text class="chart-axis-text" x={margin.left} y={height - 8}>
          {formatter.chartLabel(first.date, days === 365)}
        </text>
        <text class="chart-axis-text" x={width - margin.right} y={height - 8} text-anchor="end">
          {formatter.chartLabel(lastPoint.date, days === 365)}
        </text>
        <text class="chart-axis-text" x={width - margin.right} y={margin.top - 5} text-anchor="end">
          {formatNumber(maximum)}
        </text>
        <text class="chart-axis-text" x={width - margin.right} y={baseline - 7} text-anchor="end">
          {formatNumber(minimum)}
        </text>
      </svg>
    </div>
  )
}

const PLATFORM_COLORS = ['#7c9cff', '#53e6c4', '#f4c06a', '#9a84f7']

export function PlatformBreakdown({
  items,
  periodDownloads,
  ariaLabel = 'OS別ダウンロード構成',
}: {
  items: BreakdownItem[]
  periodDownloads: number
  ariaLabel?: string
}) {
  if (!items.length) {
    return (
      <div class="platform-breakdown">
        <ChartEmpty message="対象データがありません" />
      </div>
    )
  }

  const circumference = 2 * Math.PI * 44
  let offset = 0
  const segments = items.map((item, index) => {
    const dash = Math.min(1, Math.max(0, item.share)) * circumference
    const segment = {
      color: PLATFORM_COLORS[index % PLATFORM_COLORS.length] ?? PLATFORM_COLORS[0],
      dash,
      offset,
    }
    offset += dash
    return segment
  })

  return (
    <div class="platform-breakdown">
      <div class="donut-wrap">
        <svg viewBox="0 0 120 120" role="img" aria-label={ariaLabel}>
          <circle class="donut-track" cx="60" cy="60" r="44" />
          {segments.map((segment) => (
            <circle
              class="donut-segment"
              cx="60"
              cy="60"
              r="44"
              stroke={segment.color}
              stroke-dasharray={`${segment.dash} ${circumference - segment.dash}`}
              stroke-dashoffset={-segment.offset}
            />
          ))}
        </svg>
        <div class="donut-center">
          <strong>{formatNumber(periodDownloads)}</strong>
          <span>period total</span>
        </div>
      </div>
      <div class="platform-legend">
        {items.map((item, index) => (
          <div class="platform-row">
            <span
              class="platform-swatch"
              style={`--swatch: ${PLATFORM_COLORS[index % PLATFORM_COLORS.length]}`}
            />
            <span class="platform-copy">
              <strong>{item.label}</strong>
              <span>{formatNumber(item.downloads)} downloads</span>
            </span>
            <span class="platform-share">{formatDecimal(item.share * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ReleaseBreakdown({
  items,
  formatter,
}: {
  items: ReleaseBreakdownItem[]
  formatter: Formatter
}) {
  if (!items.length) {
    return (
      <div class="release-list">
        <ChartEmpty message="対象データがありません" />
      </div>
    )
  }

  const visible = items.slice(0, 7)
  const maximum = Math.max(...visible.map((item) => item.downloads), 1)

  return (
    <div class="release-list">
      {visible.map((item) => {
        const barWidth = Math.max(item.downloads > 0 ? 2 : 0, (item.downloads / maximum) * 100)
        return (
          <div class="release-row">
            <div class="release-name">
              <a href={safeUrl(item.url)} target="_blank" rel="noreferrer">
                {item.key}
              </a>
              <span>
                {formatter.date(item.publishedAt)}
                {item.prerelease ? ' · pre-release' : ''}
              </span>
            </div>
            <div class="release-bar-track">
              <div class="release-bar-fill" style={`--bar-width: ${barWidth.toFixed(2)}%`} />
            </div>
            <div class="release-value">{formatNumber(item.downloads)}</div>
          </div>
        )
      })}
    </div>
  )
}
