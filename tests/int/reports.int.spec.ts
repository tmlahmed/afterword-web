import { describe, expect, it } from 'vitest'

import { dhakaDay, periodFrom, toCsv } from '../../src/lib/reports'

describe('report periods', () => {
  const now = new Date('2026-11-16T20:00:00Z') // 17 Nov, 02:00 in Dhaka
  it('counts days in Dhaka time', () => {
    expect(dhakaDay(now)).toBe('2026-11-17')
    expect(periodFrom('7d', now).from.toISOString()).toBe('2026-11-10T18:00:00.000Z') // 11 Nov, midnight in Dhaka
  })
  it('works out this month and last month', () => {
    expect(periodFrom('month', now).from.toISOString()).toBe('2026-10-31T18:00:00.000Z')
    const last = periodFrom('lastmonth', now)
    expect([last.from.toISOString(), last.to.toISOString()]).toEqual(['2026-09-30T18:00:00.000Z', '2026-10-31T18:00:00.000Z'])
  })
  it('falls back to the last 30 days', () => expect(periodFrom('nonsense', now).key).toBe('30d'))
})

describe('CSV', () => {
  it('quotes separators and stops spreadsheet formulas', () => {
    expect(toCsv(['a'], [['=SUM(A1)'], ['-5'], ['x,y']])).toBe('﻿a\n\'=SUM(A1)\n-5\n"x,y"\n')
  })
})
