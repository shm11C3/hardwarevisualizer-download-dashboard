const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function toDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function assertDateKey(value: string): void {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error(`Invalid ISO date: ${value}`)
  }
}

export function addDays(dateKey: string, days: number): string {
  assertDateKey(dateKey)
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function daysBetween(start: string, end: string): number {
  assertDateKey(start)
  assertDateKey(end)
  const startMs = Date.parse(`${start}T00:00:00.000Z`)
  const endMs = Date.parse(`${end}T00:00:00.000Z`)
  return Math.round((endMs - startMs) / 86_400_000)
}

export function enumerateDates(start: string, end: string): string[] {
  const distance = daysBetween(start, end)
  if (distance < 0) {
    return []
  }

  return Array.from({ length: distance + 1 }, (_, index) => addDays(start, index))
}

export function earlierDate(left: string, right: string): string {
  return left <= right ? left : right
}

export function laterDate(left: string, right: string): string {
  return left >= right ? left : right
}
