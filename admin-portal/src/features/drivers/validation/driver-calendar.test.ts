import { describe, expect, it } from 'vitest'
import { isLocalDate, monthRange, nextDate, rangeDayCount, shiftMonth, todayInIst } from './driver-calendar'

describe('driver calendar boundaries', () => {
  it('uses Asia/Kolkata midnight rather than UTC or the host timezone', () => {
    expect(todayInIst(new Date('2026-10-16T18:29:59Z'))).toBe('2026-10-16')
    expect(todayInIst(new Date('2026-10-16T18:30:00Z'))).toBe('2026-10-17')
  })
  it.each(['2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-1-01', '0000-01-01', 'invalid'])('rejects invalid local date %s', (date) => {
    expect(isLocalDate(date)).toBe(false)
    expect(nextDate(date)).toBeNull()
  })
  it('handles leap years, year/month transitions and the exclusive end', () => {
    expect(nextDate('2024-02-28')).toBe('2024-02-29')
    expect(nextDate('2024-02-29')).toBe('2024-03-01')
    expect(nextDate('2026-12-31')).toBe('2027-01-01')
    expect(monthRange('2024-02')).toMatchObject({ from: '2024-02-01', to: '2024-03-01' })
    expect(monthRange('2024-02')?.days).toHaveLength(29)
    expect(monthRange('2026-02')?.days).toHaveLength(28)
    expect(monthRange('2026-10')?.days.at(-1)).toBe('2026-10-31')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
  it.each(['', '2026-00', '2026-13', '2026-2', '0000-01', '9999-12'])('rejects unsupported month %s', (month) => {
    expect(monthRange(month)).toBeNull()
    expect(shiftMonth(month, 1)).toBeNull()
  })
  it('bounds calendar queries and safely stops at the ISO year limits', () => {
    expect(rangeDayCount('2026-10-01', '2026-11-01')).toBe(31)
    expect(rangeDayCount('2026-10-01', '2026-11-02')).toBeNull()
    expect(rangeDayCount('2026-10-01', '2026-10-01')).toBeNull()
    expect(rangeDayCount('2026-10-02', '2026-10-01')).toBeNull()
    expect(nextDate('9999-12-31')).toBeNull()
    expect(shiftMonth('0001-01', -1)).toBeNull()
  })
})
