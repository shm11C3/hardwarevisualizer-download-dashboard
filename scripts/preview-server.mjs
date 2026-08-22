import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('..', import.meta.url)), 'public')
const port = Number(process.env.PORT ?? 4173)
const endDate = '2026-08-22'
const oneDay = 86_400_000

function dateKey(date) {
  return date.toISOString().slice(0, 10)
}

function addDays(value, days) {
  return dateKey(new Date(Date.parse(`${value}T00:00:00Z`) + days * oneDay))
}

function pseudoRandom(index) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

function dailyValue(index) {
  const trend = Math.floor(index / 80)
  const weekly = Math.sin((index / 7) * Math.PI * 2) * 5
  const releaseSpike = [56, 134, 221, 318, 354].reduce(
    (sum, releaseIndex) => sum + Math.max(0, 72 - Math.abs(index - releaseIndex) * 18),
    0,
  )
  return Math.max(3, Math.round(18 + trend + weekly + pseudoRandom(index) * 14 + releaseSpike))
}

const allRows = []
let cumulative = 4_180
for (let index = 0; index <= 400; index += 1) {
  const date = addDays(endDate, index - 400)
  const daily = dailyValue(index)
  cumulative += daily
  allRows.push({ date, daily, total: cumulative })
}

function round(value, digits = 1) {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function platformBreakdown(period) {
  const windows = Math.round(period * 0.58)
  const macos = Math.round(period * 0.27)
  const linux = Math.max(0, period - windows - macos)
  return [
    {
      key: 'windows',
      label: 'Windows',
      downloads: windows,
      totalDownloads: 4_981,
      share: period ? windows / period : 0,
    },
    {
      key: 'macos',
      label: 'macOS',
      downloads: macos,
      totalDownloads: 2_328,
      share: period ? macos / period : 0,
    },
    {
      key: 'linux',
      label: 'Linux',
      downloads: linux,
      totalDownloads: 1_291,
      share: period ? linux / period : 0,
    },
  ]
}

function releaseBreakdown(period) {
  const weights = [0.57, 0.22, 0.11, 0.065, 0.035]
  const tags = ['v1.9.2', 'v1.9.1', 'v1.9.0', 'v1.8.1', 'v1.8.0']
  // Full ISO timestamps, matching what the API returns for GitHub publish times.
  // Date-only values here would hide formatting bugs that only appear in production.
  const published = [
    '2026-07-21T17:43:53Z',
    '2026-06-25T22:44:07Z',
    '2026-06-02T08:12:40Z',
    '2026-04-18T11:05:19Z',
    '2026-03-11T14:38:02Z',
  ]
  let used = 0
  return tags.map((tag, index) => {
    const downloads =
      index === tags.length - 1 ? Math.max(0, period - used) : Math.round(period * weights[index])
    used += downloads
    return {
      key: tag,
      label: `HardwareVisualizer ${tag}`,
      downloads,
      totalDownloads: [2_461, 1_738, 1_319, 988, 721][index],
      share: period ? downloads / period : 0,
      publishedAt: published[index],
      prerelease: false,
      url: `https://github.com/shm11C3/HardwareVisualizer/releases/tag/${tag}`,
    }
  })
}

function dashboard(url) {
  const requestedDays = Number(url.searchParams.get('days') ?? 30)
  const days = [7, 30, 90, 365].includes(requestedDays) ? requestedDays : 30
  const channel = url.searchParams.get('channel') === 'all' ? 'all' : 'stable'
  const requestedScope = url.searchParams.get('scope')
  const scope = ['installers', 'distribution', 'all'].includes(requestedScope)
    ? requestedScope
    : 'installers'
  const latestIndex = allRows.length - 1
  const firstIndex = latestIndex - (days - 1)
  const baselineIndex = Math.max(0, firstIndex - 1)
  const previousBaselineIndex = Math.max(0, baselineIndex - days)
  const seriesRows = allRows.slice(firstIndex)
  const periodDownloads = allRows[latestIndex].total - allRows[baselineIndex].total
  const previousPeriodDownloads =
    allRows[baselineIndex].total - allRows[previousBaselineIndex].total
  const growthPercent = previousPeriodDownloads
    ? round(((periodDownloads - previousPeriodDownloads) / previousPeriodDownloads) * 100)
    : null
  const series = seriesRows.map((row) => ({
    date: row.date,
    totalDownloads: row.total,
    dailyDownloads: row.daily,
    observed: true,
  }))
  const platforms = platformBreakdown(periodDownloads)
  const releases = releaseBreakdown(periodDownloads)
  const peak = [...series].sort((left, right) => right.dailyDownloads - left.dailyDownloads)[0]
  const totalDownloads = allRows[latestIndex].total
  const assetWeights = [0.31, 0.22, 0.15, 0.12, 0.08, 0.06, 0.035, 0.025]
  const assetNames = [
    'HardwareVisualizer_1.9.2_x64-setup.exe',
    'HardwareVisualizer_1.9.2_x64.dmg',
    'HardwareVisualizer_1.9.2_amd64.AppImage',
    'HardwareVisualizer_1.9.2_amd64.deb',
    'HardwareVisualizer_1.9.2_aarch64.dmg',
    'HardwareVisualizer_1.9.2_x86_64.rpm',
    'HardwareVisualizer_1.9.1_x64-setup.exe',
    'HardwareVisualizer_1.9.1_amd64.AppImage',
  ]
  const assetPlatforms = [
    'windows',
    'macos',
    'linux',
    'linux',
    'macos',
    'linux',
    'windows',
    'linux',
  ]
  const assetArchitectures = ['x64', 'x64', 'x64', 'x64', 'arm64', 'x64', 'x64', 'x64']
  const assetTotals = [2_112, 1_483, 1_018, 771, 649, 522, 814, 486]

  return {
    status: 'ok',
    meta: {
      owner: 'shm11C3',
      repo: 'HardwareVisualizer',
      generatedAt: '2026-08-22T02:35:00.000Z',
      latestSnapshotDate: endDate,
      trackingSince: allRows[0].date,
      requestedStartDate: series[0].date,
      effectiveBaselineDate: allRows[baselineIndex].date,
      timeZone: 'Asia/Tokyo',
      days,
      channel,
      scope,
      observedSnapshots: days + 1,
      expectedSnapshots: days + 1,
      completeness: 1,
      lastCollection: {
        startedAt: '2026-08-21T15:10:00.000Z',
        finishedAt: '2026-08-21T15:10:01.284Z',
        status: 'success',
        fetchedReleases: 20,
        fetchedAssets: 176,
        durationMs: 1_284,
      },
    },
    summary: {
      totalDownloads,
      periodDownloads,
      previousPeriodDownloads,
      growthPercent,
      averagePerDay: round(periodDownloads / days, 2),
      latestDayDownloads: allRows[latestIndex].daily,
      latestDayDate: endDate,
    },
    series,
    platformBreakdown: platforms,
    releaseBreakdown: releases,
    topAssets: assetNames.map((name, index) => {
      const downloads = Math.round(periodDownloads * assetWeights[index])
      return {
        id: 1_000 + index,
        name,
        tag: index < 6 ? 'v1.9.2' : 'v1.9.1',
        platform: assetPlatforms[index],
        architecture: assetArchitectures[index],
        kind: 'installer',
        url: `https://github.com/shm11C3/HardwareVisualizer/releases/download/v1.9.2/${encodeURIComponent(name)}`,
        downloads,
        totalDownloads: assetTotals[index],
        share: periodDownloads ? downloads / periodDownloads : 0,
      }
    }),
    insights: [
      {
        kind: 'growth',
        title: '期間トレンド',
        value: `${growthPercent > 0 ? '+' : ''}${growthPercent}%`,
        body: `前期間の ${previousPeriodDownloads.toLocaleString('ja-JP')} 件に対し、現在期間は ${periodDownloads.toLocaleString('ja-JP')} 件です。`,
      },
      {
        kind: 'platform',
        title: '最多プラットフォーム',
        value: 'Windows',
        body: `期間内 ${platforms[0].downloads.toLocaleString('ja-JP')} 件で、構成比 ${round(platforms[0].share * 100)}% です。`,
      },
      {
        kind: 'release',
        title: '牽引リリース',
        value: 'v1.9.2',
        body: `期間内 ${releases[0].downloads.toLocaleString('ja-JP')} 件で、対象ダウンロードを最も牽引しています。`,
      },
      {
        kind: 'peak',
        title: 'ピーク日',
        value: peak.date,
        body: `${peak.dailyDownloads.toLocaleString('ja-JP')} 件を記録しました。リリース直後の反応が表れています。`,
      },
      {
        kind: 'data',
        title: 'データ完全性',
        value: '100%',
        body: `${days + 1} / ${days + 1} 日分のスナップショットを確認できました。`,
      },
    ],
  }
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `localhost:${port}`}`)

  if (url.pathname === '/api/dashboard') {
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    response.end(JSON.stringify(dashboard(url)))
    return
  }

  if (url.pathname === '/api/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ status: 'ok', preview: true }))
    return
  }

  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname
  const filePath = normalize(join(root, requestedPath))
  if (filePath !== root && !filePath.startsWith(`${root}/`)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) throw new Error('Not a file')
    const content = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    })
    response.end(content)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not Found')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Demo preview: http://127.0.0.1:${port}`)
})
