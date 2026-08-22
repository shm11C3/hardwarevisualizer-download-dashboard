import type {
  AdoptionCurve,
  BreakdownItem,
  DashboardQuery,
  Platform,
  PlatformSeriesItem,
  ReleaseBreakdownItem,
  ReleaseEvent,
  SeriesPoint,
  UpdateHealth,
} from '../types'
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

function segmentedLinePaths(
  series: SeriesPoint[],
  x: (index: number) => number,
  y: (value: number) => number,
) {
  const segments: Point[][] = []
  let segment: Point[] = []
  series.forEach((point, index) => {
    if (point.dailyDownloads === null) {
      if (segment.length) segments.push(segment)
      segment = []
      return
    }
    segment.push({ x: x(index), y: y(point.dailyDownloads) })
  })
  if (segment.length) segments.push(segment)
  return segments.filter((points) => points.length > 1).map(linePath)
}

export function UpdateHealthChart({
  health,
  days,
  formatter,
}: {
  health: UpdateHealth
  days: DashboardQuery['days']
  formatter: Formatter
}) {
  const series = health.installer.series
  if (!series.length) return <ChartEmpty message="表示できる日次データがありません" />

  const width = 900
  const height = 280
  const margin = { top: 16, right: 14, bottom: 36, left: 52 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const values = [...health.installer.series, ...health.updater.series].map(
    (point) => point.dailyDownloads ?? 0,
  )
  const maximum = niceMaximum(Math.max(...values, 1))
  const x = (index: number) => margin.left + (index / Math.max(series.length - 1, 1)) * innerWidth
  const y = (value: number) => margin.top + innerHeight - (value / maximum) * innerHeight
  const labelCount = Math.min(6, series.length)
  const labels = Array.from({ length: labelCount }, (_, index) => {
    const dataIndex = Math.round((index * (series.length - 1)) / Math.max(labelCount - 1, 1))
    return { point: series[dataIndex], x: x(dataIndex) }
  })

  return (
    <div class="chart-frame update-health-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="installer と updater の日次比較"
      >
        {Array.from({ length: 5 }, (_, index) => {
          const value = (maximum / 4) * index
          return (
            <>
              <line
                class="chart-grid-line"
                x1={margin.left}
                x2={width - margin.right}
                y1={y(value)}
                y2={y(value)}
              />
              <text class="chart-axis-text" x={margin.left - 10} y={y(value) + 3} text-anchor="end">
                {formatNumber(value)}
              </text>
            </>
          )
        })}
        {segmentedLinePaths(health.installer.series, x, y).map((path) => (
          <path class="update-health-line installer" d={path} />
        ))}
        {segmentedLinePaths(health.updater.series, x, y).map((path) => (
          <path class="update-health-line updater" d={path} />
        ))}
        {labels.map((label) => (
          <text class="chart-axis-text" x={label.x} y={height - 8} text-anchor="middle">
            {formatter.chartLabel(label.point?.date, days === 365)}
          </text>
        ))}
      </svg>
    </div>
  )
}

function ChartEmpty({ message }: { message: string }) {
  return <div class="chart-empty">{message}</div>
}

const ADOPTION_COLORS = ['#9bb2ff', '#53e6c4', '#f4c06a', '#c39cff', '#ff8797']

export function AdoptionCurveChart({ curves }: { curves: AdoptionCurve[] }) {
  if (!curves.length) {
    return (
      <div class="chart-frame adoption-chart-frame">
        <ChartEmpty message="比較できるリリースがまだありません" />
      </div>
    )
  }

  const width = 900
  const height = 330
  const margin = { top: 16, right: 16, bottom: 40, left: 58 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const maximum = niceMaximum(
    Math.max(...curves.flatMap((curve) => curve.points.map((point) => point.downloads)), 1),
  )
  const x = (day: number) => margin.left + (day / 30) * innerWidth
  const y = (downloads: number) => margin.top + innerHeight - (downloads / maximum) * innerHeight
  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = (maximum / 4) * index
    return { value, y: y(value) }
  })

  return (
    <div class="chart-frame adoption-chart-frame">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="リリース採用曲線">
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
        {[0, 5, 10, 15, 20, 25, 30].map((day) => (
          <text class="chart-axis-text" x={x(day)} y={height - 8} text-anchor="middle">
            Day {day}
          </text>
        ))}
        {curves.map((curve, curveIndex) => {
          const color = ADOPTION_COLORS[curveIndex % ADOPTION_COLORS.length]
          const segments: Point[][] = []
          let previousDay: number | null = null
          for (const point of curve.points) {
            const current = segments.at(-1)
            const chartPoint = { x: x(point.day), y: y(point.downloads) }
            if (!current || previousDay === null || point.day !== previousDay + 1) {
              segments.push([chartPoint])
            } else {
              current.push(chartPoint)
            }
            previousDay = point.day
          }

          return (
            <>
              {segments
                .filter((segment) => segment.length > 1)
                .map((segment) => (
                  <path class="adoption-line" d={linePath(segment)} stroke={color} />
                ))}
              {curve.points.map((point) => (
                <circle
                  class="adoption-point"
                  cx={x(point.day)}
                  cy={y(point.downloads)}
                  r="3"
                  stroke={color}
                >
                  <title>{`${curve.tag} · Day ${point.day}: ${formatNumber(point.downloads)} 件`}</title>
                </circle>
              ))}
            </>
          )
        })}
      </svg>
      <nav class="adoption-legend" aria-label="リリース凡例">
        {curves.map((curve, index) => (
          <a href={safeUrl(curve.url)} target="_blank" rel="noreferrer" title={curve.label}>
            <span style={`--adoption-color: ${ADOPTION_COLORS[index % ADOPTION_COLORS.length]}`} />
            {curve.tag}
          </a>
        ))}
      </nav>
    </div>
  )
}

interface DailyChartProps {
  series: SeriesPoint[]
  days: DashboardQuery['days']
  formatter: Formatter
  releaseEvents: ReleaseEvent[]
}

export function DailyChart({ series, days, formatter, releaseEvents }: DailyChartProps) {
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
        {releaseEvents.map((event) => {
          const index = series.findIndex((point) => point.date === event.date)
          if (index < 0) return null
          const x = margin.left + index * step + step / 2
          return (
            <g class="release-marker">
              <line x1={x} x2={x} y1={margin.top} y2={margin.top + innerHeight} />
              <circle cx={x} cy={margin.top + 5} r="4">
                <title>{event.tag}</title>
              </circle>
            </g>
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

export const PLATFORM_COLORS: Record<Platform, string> = {
  windows: '#7c9cff',
  macos: '#53e6c4',
  linux: '#f4c06a',
  unknown: '#9a84f7',
}

const FALLBACK_COLORS = ['#7c9cff', '#53e6c4', '#f4c06a', '#9a84f7']

function breakdownColor(key: string, index: number): string {
  return (
    PLATFORM_COLORS[key as Platform] ??
    FALLBACK_COLORS[index % FALLBACK_COLORS.length] ??
    PLATFORM_COLORS.unknown
  )
}

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
      color: breakdownColor(item.key, index),
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
            <span class="platform-swatch" style={`--swatch: ${breakdownColor(item.key, index)}`} />
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

export function PlatformTrendChart({
  items,
  days,
  formatter,
}: {
  items: PlatformSeriesItem[]
  days: DashboardQuery['days']
  formatter: Formatter
}) {
  const dates = items[0]?.points.map((point) => point.date) ?? []
  if (!dates.length) {
    return <ChartEmpty message="表示できる OS 別データがありません" />
  }

  const width = 900
  const height = 300
  const margin = { top: 12, right: 14, bottom: 36, left: 52 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const totals = dates.map((_, index) =>
    items.reduce((sum, item) => sum + (item.points[index]?.dailyDownloads ?? 0), 0),
  )
  const maximum = niceMaximum(Math.max(...totals, 1))
  const step = innerWidth / Math.max(dates.length, 1)
  const barWidth = Math.max(1.2, Math.min(13, step * 0.7))
  const y = (value: number) => margin.top + innerHeight - (value / maximum) * innerHeight
  const labelCount = Math.min(6, dates.length)
  const labels = Array.from({ length: labelCount }, (_, index) => {
    const dataIndex = Math.round((index * (dates.length - 1)) / Math.max(labelCount - 1, 1))
    return { date: dates[dataIndex], x: margin.left + dataIndex * step + step / 2 }
  })

  return (
    <div class="chart-frame platform-trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="OS別の日次ダウンロード推移">
        {Array.from({ length: 5 }, (_, index) => {
          const value = (maximum / 4) * index
          return (
            <>
              <line
                class="chart-grid-line"
                x1={margin.left}
                x2={width - margin.right}
                y1={y(value)}
                y2={y(value)}
              />
              <text class="chart-axis-text" x={margin.left - 10} y={y(value) + 3} text-anchor="end">
                {formatNumber(value)}
              </text>
            </>
          )
        })}
        {dates.map((date, index) => {
          let accumulated = 0
          return items.map((item) => {
            const value = item.points[index]?.dailyDownloads
            if (value === null || value === undefined) return null
            const barHeight = (value / maximum) * innerHeight
            const rect = (
              <rect
                class="platform-trend-segment"
                x={(margin.left + index * step + (step - barWidth) / 2).toFixed(2)}
                y={y(accumulated + value).toFixed(2)}
                width={barWidth.toFixed(2)}
                height={Math.max(value > 0 ? 1 : 0, barHeight).toFixed(2)}
                fill={PLATFORM_COLORS[item.key]}
              >
                <title>{`${date} ${item.label}: ${formatNumber(value)} 件`}</title>
              </rect>
            )
            accumulated += value
            return rect
          })
        })}
        {labels.map((label) => (
          <text class="chart-axis-text" x={label.x} y={height - 8} text-anchor="middle">
            {formatter.chartLabel(label.date, days === 365)}
          </text>
        ))}
      </svg>
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
