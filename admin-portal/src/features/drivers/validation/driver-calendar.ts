export function isLocalDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '0001-01-01' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function todayInIst(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-')
}
export function nextDate(value: string): string | null {
  if (!isLocalDate(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  const next = date.toISOString().slice(0, 10)
  return isLocalDate(next) ? next : null
}
export function monthRange(month: string): { from: string; to: string; days: string[] } | null {
  if (!/^\d{4}-\d{2}$/.test(month) || !isLocalDate(`${month}-01`)) return null
  const end = new Date(`${month}-01T00:00:00Z`)
  end.setUTCMonth(end.getUTCMonth() + 1)
  const to = end.toISOString().slice(0, 10)
  if (!isLocalDate(to)) return null
  const days: string[] = []
  for (let date: string | null = `${month}-01`; date && date < to; date = nextDate(date)) days.push(date)
  return { from: `${month}-01`, to, days }
}
export function shiftMonth(month: string, offset: number): string | null {
  if (!monthRange(month)) return null
  const date = new Date(`${month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  const next = date.toISOString().slice(0, 7)
  return monthRange(next) ? next : null
}
export function rangeDayCount(from: string, to: string): number | null {
  if (!isLocalDate(from) || !isLocalDate(to) || from >= to) return null
  const count = (Date.parse(to) - Date.parse(from)) / 86_400_000
  return count <= 31 ? count : null
}
