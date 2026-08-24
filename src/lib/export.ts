import type { SeriesPoint } from '../types'

function csvField(value: string | number | boolean): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function buildSeriesCsv(series: SeriesPoint[]): string {
  const rows = series.map((point) =>
    [point.intervalStartDate, point.dailyDownloads ?? '', point.totalDownloads, point.observed]
      .map(csvField)
      .join(','),
  )

  return `${['date,daily_downloads,cumulative_downloads,observed', ...rows].join('\r\n')}\r\n`
}

export { csvField }
