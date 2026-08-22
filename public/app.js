const state = {
  days: 30,
  channel: 'stable',
  scope: 'installers',
  loading: false,
}

const numberFormatter = new Intl.NumberFormat('ja-JP')
const decimalFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 })
const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'Asia/Tokyo',
})
const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo',
})

const elements = {
  dashboard: document.querySelector('#dashboard'),
  emptyState: document.querySelector('#empty-state'),
  emptyMessage: document.querySelector('#empty-message'),
  errorBanner: document.querySelector('#error-banner'),
  dataStatus: document.querySelector('#data-status'),
  rangeControl: document.querySelector('#range-control'),
  channelSelect: document.querySelector('#channel-select'),
  scopeSelect: document.querySelector('#scope-select'),
  refreshButton: document.querySelector('#refresh-button'),
  totalDownloads: document.querySelector('#total-downloads'),
  periodDownloads: document.querySelector('#period-downloads'),
  averageDownloads: document.querySelector('#average-downloads'),
  growthValue: document.querySelector('#growth-value'),
  growthNote: document.querySelector('#growth-note'),
  trackingNote: document.querySelector('#tracking-note'),
  periodLabel: document.querySelector('#period-label'),
  periodNote: document.querySelector('#period-note'),
  averageNote: document.querySelector('#average-note'),
  dailyChart: document.querySelector('#daily-chart'),
  cumulativeChart: document.querySelector('#cumulative-chart'),
  latestDate: document.querySelector('#latest-date'),
  latestDayDownloads: document.querySelector('#latest-day-downloads'),
  platformBreakdown: document.querySelector('#platform-breakdown'),
  releaseBreakdown: document.querySelector('#release-breakdown'),
  assetTableBody: document.querySelector('#asset-table-body'),
  insightGrid: document.querySelector('#insight-grid'),
  methodNote: document.querySelector('#method-note p'),
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function safeUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : '#'
  } catch {
    return '#'
  }
}

function formatNumber(value, maximumFractionDigits = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  if (maximumFractionDigits === 0) return numberFormatter.format(Math.round(number))
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits }).format(number)
}

// Date fields arrive in two shapes: snapshot keys are plain dates (2026-08-22),
// while GitHub publish times are full ISO timestamps. Plain keys are pinned to
// JST so they do not drift a day for viewers in other zones.
function toDate(value) {
  if (!value) return null
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00+09:00`)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value) {
  const date = toDate(value)
  return date ? dateFormatter.format(date) : '—'
}

function formatDateTime(value) {
  const date = toDate(value)
  return date ? dateTimeFormatter.format(date) : '—'
}

function parseStateFromUrl() {
  const params = new URLSearchParams(location.search)
  const days = Number(params.get('days'))
  const channel = params.get('channel')
  const scope = params.get('scope')

  state.days = [7, 30, 90, 365].includes(days) ? days : 30
  state.channel = ['stable', 'all'].includes(channel) ? channel : 'stable'
  state.scope = ['installers', 'distribution', 'all'].includes(scope) ? scope : 'installers'
}

function syncControls() {
  for (const button of elements.rangeControl.querySelectorAll('button[data-days]')) {
    button.classList.toggle('active', Number(button.dataset.days) === state.days)
  }
  elements.channelSelect.value = state.channel
  elements.scopeSelect.value = state.scope
}

function syncUrl(push = true) {
  const params = new URLSearchParams({
    days: String(state.days),
    channel: state.channel,
    scope: state.scope,
  })
  const method = push ? 'pushState' : 'replaceState'
  history[method](null, '', `${location.pathname}?${params.toString()}`)
}

function setLoading(loading) {
  state.loading = loading
  elements.dashboard.setAttribute('aria-busy', String(loading))
  elements.refreshButton.classList.toggle('loading', loading)
  elements.refreshButton.disabled = loading
}

function setStatus(kind, message) {
  elements.dataStatus.classList.remove('ready', 'error')
  if (kind) elements.dataStatus.classList.add(kind)
  elements.dataStatus.querySelector('span:last-child').textContent = message
}

function showError(message) {
  elements.errorBanner.hidden = false
  elements.errorBanner.textContent = message
  setStatus('error', 'データ取得エラー')
}

function clearError() {
  elements.errorBanner.hidden = true
  elements.errorBanner.textContent = ''
}

function periodText(days) {
  return days === 365 ? '直近1年' : `直近${days}日`
}

function niceMaximum(value) {
  if (value <= 0) return 10
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return nice * magnitude
}

function chartLabelDate(value, includeYear = false) {
  const date = toDate(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat('ja-JP', {
    ...(includeYear ? { year: '2-digit' } : {}),
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Tokyo',
  }).format(date)
}

function createLinePath(points) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ')
}

function renderDailyChart(series) {
  if (!series.length) {
    elements.dailyChart.innerHTML =
      '<div class="chart-empty">表示できる日次データがありません</div>'
    return
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
  const y = (value) => margin.top + innerHeight - (value / maximum) * innerHeight
  const axisLines = []

  for (let index = 0; index <= 4; index += 1) {
    const value = (maximum / 4) * index
    const lineY = y(value)
    axisLines.push(`
      <line class="chart-grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${lineY}" y2="${lineY}" />
      <text class="chart-axis-text" x="${margin.left - 10}" y="${lineY + 3}" text-anchor="end">${escapeHtml(formatNumber(value))}</text>
    `)
  }

  const bars = series
    .map((point, index) => {
      if (point.dailyDownloads === null) return ''
      const value = point.dailyDownloads
      const barHeight = Math.max(value > 0 ? 1.5 : 0, (value / maximum) * innerHeight)
      const x = margin.left + index * step + (step - barWidth) / 2
      const barY = margin.top + innerHeight - barHeight
      return `<rect class="chart-bar" x="${x.toFixed(2)}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}"><title>${escapeHtml(point.date)}: ${escapeHtml(formatNumber(value))} 件</title></rect>`
    })
    .join('')

  const movingAveragePoints = []
  for (let index = 0; index < series.length; index += 1) {
    const windowValues = series
      .slice(Math.max(0, index - 6), index + 1)
      .map((point) => point.dailyDownloads)
      .filter((value) => value !== null)
    if (windowValues.length < Math.min(3, index + 1)) continue
    const average = windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length
    movingAveragePoints.push({
      x: margin.left + index * step + step / 2,
      y: y(average),
    })
  }

  const labelCount = Math.min(6, series.length)
  const xLabels = Array.from({ length: labelCount }, (_, index) => {
    const dataIndex = Math.round((index * (series.length - 1)) / Math.max(labelCount - 1, 1))
    const point = series[dataIndex]
    const x = margin.left + dataIndex * step + step / 2
    return `<text class="chart-axis-text" x="${x}" y="${height - 8}" text-anchor="middle">${escapeHtml(chartLabelDate(point.date, state.days === 365))}</text>`
  }).join('')

  elements.dailyChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(periodText(state.days))}の日次ダウンロード数">
      <defs>
        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#9bb2ff" />
          <stop offset="1" stop-color="#5f79db" stop-opacity="0.48" />
        </linearGradient>
      </defs>
      ${axisLines.join('')}
      ${bars}
      ${movingAveragePoints.length > 1 ? `<path class="chart-line" d="${createLinePath(movingAveragePoints)}" />` : ''}
      ${xLabels}
    </svg>
  `
}

function renderCumulativeChart(series) {
  if (!series.length) {
    elements.cumulativeChart.innerHTML =
      '<div class="chart-empty">表示できる累積データがありません</div>'
    return
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
  const linePath = createLinePath(points)
  const areaPath = `${linePath} L${points.at(-1).x},${margin.top + innerHeight} L${points[0].x},${margin.top + innerHeight} Z`
  const last = points.at(-1)

  elements.cumulativeChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="累積ダウンロード推移">
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7c9cff" stop-opacity="0.32" />
          <stop offset="1" stop-color="#7c9cff" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line class="chart-grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top}" y2="${margin.top}" />
      <line class="chart-grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top + innerHeight}" y2="${margin.top + innerHeight}" />
      <path class="cumulative-area" d="${areaPath}" />
      <path class="cumulative-line" d="${linePath}" />
      <circle class="chart-point" cx="${last.x}" cy="${last.y}" r="4"><title>${escapeHtml(last.date)}: ${escapeHtml(formatNumber(last.value))} 件</title></circle>
      <text class="chart-axis-text" x="${margin.left}" y="${height - 8}">${escapeHtml(chartLabelDate(series[0].date, state.days === 365))}</text>
      <text class="chart-axis-text" x="${width - margin.right}" y="${height - 8}" text-anchor="end">${escapeHtml(chartLabelDate(series.at(-1).date, state.days === 365))}</text>
      <text class="chart-axis-text" x="${width - margin.right}" y="${margin.top - 5}" text-anchor="end">${escapeHtml(formatNumber(maximum))}</text>
      <text class="chart-axis-text" x="${width - margin.right}" y="${margin.top + innerHeight - 7}" text-anchor="end">${escapeHtml(formatNumber(minimum))}</text>
    </svg>
  `
}

const platformColors = ['#7c9cff', '#53e6c4', '#f4c06a', '#9a84f7']

function renderPlatformBreakdown(items, periodDownloads) {
  if (!items.length) {
    elements.platformBreakdown.innerHTML = '<div class="chart-empty">対象データがありません</div>'
    return
  }

  const circumference = 2 * Math.PI * 44
  let offset = 0
  const segments = items
    .map((item, index) => {
      const fraction = Math.min(1, Math.max(0, item.share))
      const dash = fraction * circumference
      const segment = `<circle class="donut-segment" cx="60" cy="60" r="44" stroke="${platformColors[index % platformColors.length]}" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" />`
      offset += dash
      return segment
    })
    .join('')

  const legend = items
    .map(
      (item, index) => `
        <div class="platform-row">
          <span class="platform-swatch" style="--swatch: ${platformColors[index % platformColors.length]}"></span>
          <span class="platform-copy"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(formatNumber(item.downloads))} downloads</span></span>
          <span class="platform-share">${escapeHtml(decimalFormatter.format(item.share * 100))}%</span>
        </div>
      `,
    )
    .join('')

  elements.platformBreakdown.innerHTML = `
    <div class="donut-wrap">
      <svg viewBox="0 0 120 120" role="img" aria-label="OS別ダウンロード構成">
        <circle class="donut-track" cx="60" cy="60" r="44" />
        ${segments}
      </svg>
      <div class="donut-center"><strong>${escapeHtml(formatNumber(periodDownloads))}</strong><span>period total</span></div>
    </div>
    <div class="platform-legend">${legend}</div>
  `
}

function renderReleaseBreakdown(items) {
  if (!items.length) {
    elements.releaseBreakdown.innerHTML = '<div class="chart-empty">対象データがありません</div>'
    return
  }

  const visibleItems = items.slice(0, 7)
  const maximum = Math.max(...visibleItems.map((item) => item.downloads), 1)
  elements.releaseBreakdown.innerHTML = visibleItems
    .map((item) => {
      const width = Math.max(item.downloads > 0 ? 2 : 0, (item.downloads / maximum) * 100)
      return `
        <div class="release-row">
          <div class="release-name">
            <a href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noreferrer">${escapeHtml(item.key)}</a>
            <span>${escapeHtml(formatDate(item.publishedAt))}${item.prerelease ? ' · pre-release' : ''}</span>
          </div>
          <div class="release-bar-track"><div class="release-bar-fill" style="--bar-width: ${width.toFixed(2)}%"></div></div>
          <div class="release-value">${escapeHtml(formatNumber(item.downloads))}</div>
        </div>
      `
    })
    .join('')
}

const platformLabels = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  unknown: 'その他',
}

const architectureLabels = {
  x64: 'x64',
  arm64: 'ARM64',
  x86: 'x86',
  universal: 'Universal',
  unknown: '—',
}

function renderAssetTable(items) {
  if (!items.length) {
    elements.assetTableBody.innerHTML =
      '<tr><td class="empty-table-cell" colspan="6">対象データがありません</td></tr>'
    return
  }

  elements.assetTableBody.innerHTML = items
    .slice(0, 10)
    .map(
      (item) => `
        <tr>
          <td class="asset-name-cell"><a href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noreferrer" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</a></td>
          <td>${escapeHtml(item.tag)}</td>
          <td><span class="platform-badge">${escapeHtml(platformLabels[item.platform] ?? item.platform)}</span></td>
          <td>${escapeHtml(architectureLabels[item.architecture] ?? item.architecture)}</td>
          <td class="number-cell">${escapeHtml(formatNumber(item.downloads))}</td>
          <td class="number-cell">${escapeHtml(formatNumber(item.totalDownloads))}</td>
        </tr>
      `,
    )
    .join('')
}

const insightIcons = {
  growth: '↗',
  platform: '⌘',
  release: '◇',
  peak: '⌁',
  data: '✓',
}

function renderInsights(items) {
  elements.insightGrid.innerHTML = items
    .map(
      (item) => `
        <article class="insight-card">
          <div class="insight-icon">${escapeHtml(insightIcons[item.kind] ?? '·')}</div>
          <span>${escapeHtml(item.title)}</span>
          <strong title="${escapeHtml(item.value)}">${escapeHtml(item.value)}</strong>
          <p>${escapeHtml(item.body)}</p>
        </article>
      `,
    )
    .join('')
}

function renderSummary(data) {
  const { summary, meta } = data
  elements.totalDownloads.textContent = formatNumber(summary.totalDownloads)
  elements.periodDownloads.textContent = formatNumber(summary.periodDownloads)
  elements.averageDownloads.textContent = formatNumber(summary.averagePerDay, 1)
  elements.periodLabel.textContent = periodText(meta.days)
  elements.periodNote.textContent = `${formatDate(meta.effectiveBaselineDate)} 以降の増分`
  elements.averageNote.textContent = '観測できた期間の日数で算出'
  elements.trackingNote.textContent = `${formatDate(meta.trackingSince)} から追跡`
  elements.latestDate.textContent = `最新 ${formatDate(meta.latestSnapshotDate)}`
  elements.latestDayDownloads.textContent =
    summary.latestDayDownloads === null ? '—' : `+${formatNumber(summary.latestDayDownloads)}`

  elements.growthValue.classList.remove('positive', 'negative')
  if (summary.growthPercent === null) {
    elements.growthValue.textContent = '—'
    elements.growthNote.textContent =
      summary.previousPeriodDownloads === 0 && summary.periodDownloads > 0
        ? '前期間は 0 件'
        : '比較期間のデータ不足'
  } else {
    const prefix = summary.growthPercent > 0 ? '+' : ''
    elements.growthValue.textContent = `${prefix}${decimalFormatter.format(summary.growthPercent)}%`
    elements.growthValue.classList.add(summary.growthPercent >= 0 ? 'positive' : 'negative')
    elements.growthNote.textContent = `前期間 ${formatNumber(summary.previousPeriodDownloads)} 件`
  }

  for (const item of [
    elements.totalDownloads,
    elements.periodDownloads,
    elements.averageDownloads,
    elements.growthValue,
  ]) {
    item.classList.remove('skeleton-text')
  }
}

function renderDashboard(data) {
  elements.emptyState.hidden = true
  elements.dashboard.hidden = false
  renderSummary(data)
  renderDailyChart(data.series)
  renderCumulativeChart(data.series)
  renderPlatformBreakdown(data.platformBreakdown, data.summary.periodDownloads)
  renderReleaseBreakdown(data.releaseBreakdown)
  renderAssetTable(data.topAssets)
  renderInsights(data.insights)
  elements.methodNote.textContent = `GitHub が提供するアセット別の累積ダウンロード数を日次保存し、前回値との差を算出しています。追跡開始日は ${formatDate(data.meta.trackingSince)} です。初回収集以前の日次履歴は復元できず、欠損日をまたぐ差分は日次グラフから除外します。`

  const lastCollection = data.meta.lastCollection
  if (lastCollection?.status === 'failed') {
    setStatus(
      'error',
      `最終収集でエラー · ${formatDateTime(lastCollection.finishedAt ?? lastCollection.startedAt)}`,
    )
  } else if (lastCollection) {
    setStatus(
      'ready',
      `最終収集 ${formatDateTime(lastCollection.finishedAt ?? lastCollection.startedAt)}`,
    )
  } else {
    setStatus('ready', `最新スナップショット ${formatDate(data.meta.latestSnapshotDate)}`)
  }
}

function renderEmpty(data) {
  elements.dashboard.hidden = true
  elements.emptyState.hidden = false
  elements.emptyMessage.textContent = data.message
  const lastCollection = data.meta.lastCollection
  if (lastCollection?.status === 'failed') {
    setStatus('error', '初回収集に失敗')
  } else {
    setStatus('', 'まだ履歴がありません')
  }
}

async function loadDashboard({ bypassCache = false } = {}) {
  if (state.loading) return
  setLoading(true)
  clearError()

  const params = new URLSearchParams({
    days: String(state.days),
    channel: state.channel,
    scope: state.scope,
  })
  if (bypassCache) params.set('_', String(Date.now()))

  try {
    const response = await fetch(`/api/dashboard?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      cache: bypassCache ? 'no-store' : 'default',
    })
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }
    const data = await response.json()
    if (data.status === 'empty') {
      renderEmpty(data)
    } else if (data.status === 'ok') {
      renderDashboard(data)
    } else {
      throw new Error('Unexpected API response')
    }
  } catch (error) {
    showError(
      `ダウンロード分析データを取得できませんでした。${error instanceof Error ? ` ${error.message}` : ''}`,
    )
  } finally {
    setLoading(false)
  }
}

elements.rangeControl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-days]')
  if (!button || state.loading) return
  state.days = Number(button.dataset.days)
  syncControls()
  syncUrl()
  loadDashboard()
})

elements.channelSelect.addEventListener('change', () => {
  state.channel = elements.channelSelect.value
  syncUrl()
  loadDashboard()
})

elements.scopeSelect.addEventListener('change', () => {
  state.scope = elements.scopeSelect.value
  syncUrl()
  loadDashboard()
})

elements.refreshButton.addEventListener('click', () => loadDashboard({ bypassCache: true }))

window.addEventListener('popstate', () => {
  parseStateFromUrl()
  syncControls()
  loadDashboard()
})

parseStateFromUrl()
syncControls()
syncUrl(false)
loadDashboard()
