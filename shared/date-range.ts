export const MAX_RANGE_DAYS = 93

/** Parse YYYY-MM-DD as local calendar day; other strings use Date.parse. */
export function resolveDateMs(date?: unknown): number {
  if (date === undefined || date === null || date === '') return Date.now()
  if (typeof date === 'number' && Number.isFinite(date)) return date
  if (typeof date === 'string' && date.trim()) {
    const iso = date.trim()
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
    }
    const parsed = Date.parse(iso)
    if (!Number.isNaN(parsed)) return parsed
  }
  return Date.now()
}

export function localDayBounds(dateMs = Date.now()): { start: number; end: number; date: string } {
  const d = new Date(dateMs)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return { start, end: start + 86_400_000 - 1, date }
}

export type RangeBounds = {
  start_ms: number
  end_ms: number
  start_date: string
  end_date: string
}

/** Resolve a single day, or start_date..end_date (inclusive, local midnight boundaries). */
export function resolveRangeBounds(args: {
  start_date?: unknown
  end_date?: unknown
  date?: unknown
}): RangeBounds {
  const hasStart = args.start_date != null && String(args.start_date).trim() !== ''
  const hasEnd = args.end_date != null && String(args.end_date).trim() !== ''
  const hasSingle = args.date != null && String(args.date).trim() !== ''

  if (hasStart || hasEnd) {
    const startBounds = localDayBounds(resolveDateMs(hasStart ? args.start_date : args.end_date))
    const endBounds = localDayBounds(resolveDateMs(hasEnd ? args.end_date : args.start_date))
    if (startBounds.start > endBounds.end) {
      throw new Error('start_date must be on or before end_date.')
    }
    const daySpan = (endBounds.start - startBounds.start) / 86_400_000 + 1
    if (daySpan > MAX_RANGE_DAYS) {
      throw new Error(`Date range exceeds ${MAX_RANGE_DAYS} days. Narrow start_date/end_date.`)
    }
    return {
      start_ms: startBounds.start,
      end_ms: endBounds.end,
      start_date: startBounds.date,
      end_date: endBounds.date,
    }
  }

  if (hasSingle) {
    const b = localDayBounds(resolveDateMs(args.date))
    return { start_ms: b.start, end_ms: b.end, start_date: b.date, end_date: b.date }
  }

  const today = localDayBounds(Date.now())
  return {
    start_ms: today.start,
    end_ms: today.end,
    start_date: today.date,
    end_date: today.date,
  }
}

/** Calendar day for an entry: explicit date string, logged_at ms, or now. */
export function resolveLoggedAt(args: { date?: unknown; logged_at?: unknown }): number {
  if (typeof args.logged_at === 'number' && Number.isFinite(args.logged_at)) {
    return args.logged_at
  }
  if (args.date != null && String(args.date).trim() !== '') {
    const { start } = localDayBounds(resolveDateMs(args.date))
    return start + 12 * 60 * 60 * 1000
  }
  return Date.now()
}

const LOCAL_DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** Local weekday name for a YYYY-MM-DD calendar day (operator timezone). */
export function localDayOfWeekFromDate(dateYmd: string): string {
  const { start } = localDayBounds(resolveDateMs(dateYmd))
  return LOCAL_DAY_NAMES[new Date(start).getDay()]
}

/** Human-readable local date/time for tool responses (broker runs on operator's PC). */
export type LocalLoggedAt = {
  /** Unix ms — canonical stored value; do not ask the model to convert this. */
  logged_at: number
  /** Local calendar day YYYY-MM-DD */
  logged_date: string
  /** Local weekday name, e.g. Monday — derived from logged_at, not stored in DB */
  logged_day_of_week: string
  /** Local time HH:MM (24h) */
  logged_time: string
  /** Local weekday + date + time — cite when answering when a meal/workout was logged */
  logged_datetime_local: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Format stored ms as operator-local date and time fields. */
export function formatLocalLoggedAt(loggedAtMs: number): LocalLoggedAt {
  const d = new Date(loggedAtMs)
  const logged_date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const logged_day_of_week = LOCAL_DAY_NAMES[d.getDay()]
  const logged_time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return {
    logged_at: loggedAtMs,
    logged_date,
    logged_day_of_week,
    logged_time,
    logged_datetime_local: `${logged_day_of_week} ${logged_date} ${logged_time}`,
  }
}

export function eachDayInRange(startMs: number, endMs: number): number[] {
  const days: number[] = []
  let cursor = localDayBounds(startMs).start
  const last = localDayBounds(endMs).start
  while (cursor <= last) {
    days.push(cursor)
    cursor += 86_400_000
  }
  return days
}
