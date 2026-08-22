import type { DashboardQuery } from '../types'

const PLAIN_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const EM_DASH = '—'

const numberFormatter = new Intl.NumberFormat('ja-JP')
const decimalFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 })

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
  const number = Number(value)
  if (!Number.isFinite(number)) return EM_DASH
  if (maximumFractionDigits === 0) return numberFormatter.format(Math.round(number))
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits }).format(number)
}

export function formatDecimal(value: number): string {
  return decimalFormatter.format(value)
}

export function periodText(days: DashboardQuery['days']): string {
  return days === 365 ? '直近1年' : `直近${days}日`
}

export function safeUrl(value: string | null | undefined): string {
  if (!value) return '#'
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : '#'
  } catch {
    return '#'
  }
}

export interface Formatter {
  date(value: string | null | undefined): string
  dateTime(value: string | null | undefined): string
  chartLabel(value: string | null | undefined, includeYear: boolean): string
}

// Two date shapes reach the views: snapshot keys are plain dates (2026-08-22)
// already resolved in the collector's time zone, while GitHub publish times are
// full ISO timestamps. Plain keys are formatted straight from their components
// in UTC so they never shift a day, and timestamps are rendered in the
// dashboard's configured zone.
export function createFormatter(timeZone: string): Formatter {
  const zoned = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('ja-JP', { ...options, timeZone })
  const utc = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('ja-JP', { ...options, timeZone: 'UTC' })

  const dateOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
  const dateTimeOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }

  const zonedDate = zoned(dateOptions)
  const utcDate = utc(dateOptions)
  const zonedDateTime = zoned(dateTimeOptions)
  const utcDateTime = utc(dateTimeOptions)

  function resolve(value: string | null | undefined): { date: Date; plain: boolean } | null {
    if (!value) return null
    const plain = PLAIN_DATE_PATTERN.test(value)
    const date = new Date(plain ? `${value}T00:00:00.000Z` : value)
    return Number.isNaN(date.getTime()) ? null : { date, plain }
  }

  return {
    date(value) {
      const resolved = resolve(value)
      if (!resolved) return EM_DASH
      return (resolved.plain ? utcDate : zonedDate).format(resolved.date)
    },
    dateTime(value) {
      const resolved = resolve(value)
      if (!resolved) return EM_DASH
      return (resolved.plain ? utcDateTime : zonedDateTime).format(resolved.date)
    },
    chartLabel(value, includeYear) {
      const resolved = resolve(value)
      if (!resolved) return EM_DASH
      const options: Intl.DateTimeFormatOptions = {
        ...(includeYear ? { year: '2-digit' as const } : {}),
        month: 'numeric',
        day: 'numeric',
      }
      const format = resolved.plain ? utc(options) : zoned(options)
      return format.format(resolved.date)
    },
  }
}
