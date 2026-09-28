// Calendar-day helpers. Days are "YYYY-MM-DD" strings in the learner's local time.
// Day arithmetic works on the date itself (via UTC), so daylight-saving changes cannot
// skip or repeat a day.

/** Local calendar day of an instant. timeZone defaults to this device's zone. */
export function localDay(d: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (type: string) => {
    const p = parts.find((x) => x.type === type)
    if (!p) throw new Error(`Intl.DateTimeFormat gave no ${type} part for ${d.toISOString()}`)
    return p.value
  }
  return `${get('year')}-${get('month')}-${get('day')}`
}

function toUtc(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) throw new Error(`Not a day string: "${day}"`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function addDays(day: string, n: number): string {
  return new Date(toUtc(day) + n * 86_400_000).toISOString().slice(0, 10)
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}

/** Monday of the week that contains day (weeks run Monday to Sunday, as in Germany). */
export function mondayOf(day: string): string {
  const weekday = new Date(toUtc(day)).getUTCDay() // 0 Sunday .. 6 Saturday
  return addDays(day, -((weekday + 6) % 7))
}
