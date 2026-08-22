import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, enumerateDates, toDateKey } from '../src/lib/date'

describe('date helpers', () => {
  it('uses the configured timezone around midnight', () => {
    expect(toDateKey(new Date('2026-08-21T15:10:00.000Z'), 'Asia/Tokyo')).toBe('2026-08-22')
  })

  it('adds days across month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('enumerates inclusive dates', () => {
    expect(enumerateDates('2026-08-20', '2026-08-22')).toEqual([
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
    ])
    expect(daysBetween('2026-08-20', '2026-08-22')).toBe(2)
  })
})
