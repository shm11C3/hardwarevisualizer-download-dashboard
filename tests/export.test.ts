import { describe, expect, it } from 'vitest'
import { buildSeriesCsv, csvField } from '../src/lib/export'

describe('buildSeriesCsv', () => {
  it('writes a blank daily value for a missing delta and uses CRLF rows', () => {
    expect(
      buildSeriesCsv([
        {
          date: '2026-08-21',
          dailyDownloads: null,
          totalDownloads: 1_234,
          observed: false,
        },
      ]),
    ).toBe('date,daily_downloads,cumulative_downloads,observed\r\n2026-08-21,,1234,false\r\n')
  })

  it('escapes commas, quotes, and line breaks according to CSV rules', () => {
    expect(csvField('alpha,"beta"\nnext')).toBe('"alpha,""beta""\nnext"')
  })
})
