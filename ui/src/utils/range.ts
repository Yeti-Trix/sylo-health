import type { RangePayload } from '../bridge'

export type RangePreset = 'today' | 'week' | 'month' | 'year'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayYmd(): string {
  return ymd(new Date())
}

export function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return ymd(d)
}

/** Map UI preset to bridge date args (year capped at 93 days per backend). */
export function rangePayload(preset: RangePreset): RangePayload {
  const end = todayYmd()
  switch (preset) {
    case 'today':
      return { date: end, limit: 100 }
    case 'week':
      return { start_date: daysAgo(6), end_date: end, limit: 200 }
    case 'month':
      return { start_date: daysAgo(29), end_date: end, limit: 300 }
    case 'year':
      return { start_date: daysAgo(92), end_date: end, limit: 500 }
  }
}

export function rangeLabel(preset: RangePreset): string {
  switch (preset) {
    case 'today':
      return 'Today'
    case 'week':
      return 'Last 7 days'
    case 'month':
      return 'Last 30 days'
    case 'year':
      return 'Last 93 days'
  }
}
