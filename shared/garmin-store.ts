/**
 * Garmin Connect daily-metric store.
 *
 * Pulls a day's raw endpoint dump (via the `garmin_fetch.py` sidecar) into a
 * normalized `GarminDailyRow`, upserted by date into the JSON health store
 * (`<sylo-user>/health/garmin/YYYY-MM.ndjson`). Re-pulling a day updates it
 * in place — no duplicates.
 *
 * See `features_tracker/active/2026-08-11_23-50-00_sylo_health_garmin_sync.md`.
 */
import { formatLocalLoggedAt, resolveRangeBounds } from './date-range.js'
import type { HealthStore } from './health-store.js'
import type {
  GarminDailyRow,
  GarminMetricAgg,
  GarminRangeSummary,
  GarminReport,
  GarminReportDay,
} from './types.js'

/** Best-effort numeric coerce: null/undefined/"" -> null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function dig(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj
  for (const k of keys) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k]
    } else {
      return undefined
    }
  }
  return cur
}

/** Local YYYY-MM-DD for a calendar date string ('YYYY-MM-DD') → ms at local midnight. */
function dayLocalMidnightMs(dateYmd: string): number {
  const [y, m, d] = dateYmd.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).getTime()
}

/** Extract a normalized GarminDailyRow from a raw endpoint dump for a date. */
export function extractGarminDaily(date: string, dump: Record<string, unknown>): GarminDailyRow {
  const stats = (dump.stats as Record<string, unknown> | undefined) ?? {}
  const hr = (dump.heart_rates as Record<string, unknown> | undefined) ?? {}
  const sleep = ((dump.sleep as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
  const dailySleep = (sleep.dailySleepDTO as Record<string, unknown> | undefined) ?? {}
  const hrv = (dump.hrv as Record<string, unknown> | undefined) ?? {}
  const hrvSummary = (hrv.hrvSummary as Record<string, unknown> | undefined) ?? {}
  const spo2 = (dump.spo2 as Record<string, unknown> | undefined) ?? {}
  const resp = (dump.respiration as Record<string, unknown> | undefined) ?? {}
  const stress = (dump.stress as Record<string, unknown> | undefined) ?? {}
  const bbArr = dump.body_battery
  const bb =
    (Array.isArray(bbArr) && (bbArr[0] as Record<string, unknown> | undefined)) || undefined
  const tr = (dump.training_readiness as Record<string, unknown> | undefined) ?? {}
  const fa = (dump.fitnessage as Record<string, unknown> | undefined) ?? {}
  const us = (dump.user_summary as Record<string, unknown> | undefined) ?? stats
  const hzArr = dump.hr_zones
  const hz =
    (Array.isArray(hzArr) && (hzArr[0] as Record<string, unknown> | undefined)) || undefined
  const floors = dump.floors as Record<string, unknown> | undefined
  const floorValues = floors?.floorValuesArray

  // VO2 max: prefer max_metrics list, fall back to training_status.mostRecentVO2Max
  let vo2: number | null = null
  const maxMetrics = dump.vo2_max_fallback
  if (Array.isArray(maxMetrics)) {
    for (const m of maxMetrics) {
      const row = m as Record<string, unknown>
      const mt = row.measurementTypeKey
      if (mt === 'VO2_MAX' || mt === 'genericVO2Max') {
        vo2 = num(row.formattedValue ?? row.value)
        if (vo2 != null) break
      }
    }
  }
  if (vo2 == null) {
    vo2 = num(
      dig(dump.training_status, 'mostRecentVO2Max', 'generic', 'formattedValue') ??
        dig(dump.training_status, 'mostRecentVO2Max', 'generic', 'value'),
    )
  }

  const hrZones: number[] | null =
    hz ? [
        num(hz.zone1Floor),
        num(hz.zone2Floor),
        num(hz.zone3Floor),
        num(hz.zone4Floor),
        num(hz.zone5Floor),
      ].filter((x) => x != null).length === 5 ?
        [num(hz.zone1Floor)!, num(hz.zone2Floor)!, num(hz.zone3Floor)!, num(hz.zone4Floor)!, num(hz.zone5Floor)!]
      : null
    : null

  // Sleep scores (nested objects with qualifierKey + optional value)
  const sleepScores = (dailySleep.sleepScores as Record<string, unknown> | undefined) ?? {}
  const overallScore = (sleepScores.overall as Record<string, unknown> | undefined) ?? {}
  const deepPct = (sleepScores.deepPercentage as Record<string, unknown> | undefined) ?? {}
  const remPct = (sleepScores.remPercentage as Record<string, unknown> | undefined) ?? {}

  // Body battery end-of-day level label
  const bbEod = (bb?.endOfDayBodyBatteryDynamicFeedbackEvent as Record<string, unknown> | undefined) ?? {}

  // HRV baseline (nested object)
  const hrvBaseline = (hrvSummary.baseline as Record<string, unknown> | undefined) ?? {}

  return {
    date,
    logged_at: dayLocalMidnightMs(date),
    source: 'garmin_connect',
    updated_at: Date.now(),
    // vitals
    resting_hr: num(hr.restingHeartRate ?? dig(stats, 'restingHeartRate')),
    max_hr: num(hr.maxHeartRate),
    min_hr: num(hr.minHeartRate),
    rhr_7day_avg: num(hr.lastSevenDaysAvgRestingHeartRate),
    hrv_avg: num(hrvSummary.lastNightAvg ?? hrv.lastNightAvg),
    hrv_5min_high: num(hrvSummary.lastNight5MinHigh),
    hrv_status: typeof hrvSummary.status === 'string' ? hrvSummary.status : null,
    hrv_weekly_avg: num(hrvSummary.weeklyAvg),
    hrv_baseline_balanced_low: num(hrvBaseline.balancedLow),
    vo2_max: vo2,
    // sleep (seconds)
    sleep_seconds: num(dailySleep.sleepTimeSeconds),
    deep_sleep_seconds: num(dailySleep.deepSleepSeconds),
    rem_sleep_seconds: num(dailySleep.remSleepSeconds),
    light_sleep_seconds: num(dailySleep.lightSleepSeconds),
    awake_sleep_seconds: num(dailySleep.awakeSleepSeconds),
    sleep_score: num(overallScore.value),
    sleep_score_qualifier: typeof overallScore.qualifierKey === 'string' ? overallScore.qualifierKey : null,
    deep_sleep_pct: num(deepPct.value),
    rem_sleep_pct: num(remPct.value),
    sleep_feedback: typeof dailySleep.sleepScoreFeedback === 'string' ? dailySleep.sleepScoreFeedback : null,
    sleep_insight: typeof dailySleep.sleepScoreInsight === 'string' ? dailySleep.sleepScoreInsight : null,
    sleep_personalized_insight: typeof dailySleep.sleepScorePersonalizedInsight === 'string' ? dailySleep.sleepScorePersonalizedInsight : null,
    sleep_avg_hr: num(dailySleep.avgHeartRate),
    sleep_avg_stress: num(dailySleep.avgSleepStress),
    sleep_awake_count: num(dailySleep.awakeCount),
    sleep_lowest_spo2: num(dailySleep.lowestSpO2Value),
    // overnight
    spo2_avg: num(spo2.averageSpO2 ?? spo2.avgSleepSpO2),
    spo2_sleep_avg: num(spo2.avgSleepSpO2),
    spo2_min: num(spo2.lowestSpO2),
    spo2_7day_avg: num(spo2.lastSevenDaysAvgSpO2),
    respiration_avg: num(resp.avgWakingRespirationValue ?? resp.averageRespirationValue),
    // stress / activity
    stress_avg: num(stress.avgStressLevel ?? dig(stats, 'averageStressLevel')),
    stress_max: num(stress.maxStressLevel),
    steps: num(dig(stats, 'totalSteps') ?? us.totalSteps),
    distance_m: num(dig(stats, 'totalDistanceMeters') ?? us.totalDistanceMeters),
    floors: Array.isArray(floorValues) ? floorValues.length : null,
    // energy
    calories_total: num(us.totalKilocalories ?? stats.totalKilocalories),
    calories_active: num(us.activeKilocalories ?? stats.activeKilocalories),
    body_battery_charged: num(bb?.charged),
    body_battery_drained: num(bb?.drained),
    body_battery_end_level: typeof bbEod.bodyBatteryLevel === 'string' ? bbEod.bodyBatteryLevel : null,
    // training
    training_readiness_score: num(tr.score),
    training_readiness_level: typeof tr.level === 'string' ? tr.level : null,
    training_readiness_feedback: typeof tr.feedbackShort === 'string' ? tr.feedbackShort : null,
    fitness_age: num(fa.fitnessAge),
    hr_zones: hrZones,
    raw_json: dump,
  }
}

/** Enrich a row with local display fields (logged_date, logged_datetime_local). */
export function enrichGarminEntry(entry: GarminDailyRow): GarminDailyRow {
  const local = formatLocalLoggedAt(entry.logged_at)
  return {
    ...entry,
    logged_date: local.logged_date,
    logged_datetime_local: local.logged_datetime_local,
  }
}

export function enrichGarminEntries(entries: GarminDailyRow[]): GarminDailyRow[] {
  return entries.map(enrichGarminEntry)
}

/** Idempotent upsert of a parsed row into the store (by date). */
export function upsertGarminDaily(s: HealthStore, row: GarminDailyRow): GarminDailyRow {
  s.upsertGarminDaily(row)
  return row
}

export function getGarminDaily(s: HealthStore, date: string): GarminDailyRow | null {
  return s.garmin.find((e) => e.date === date) ?? null
}

export function listGarminDaily(
  s: HealthStore,
  opts?: { from_ms?: number; to_ms?: number; limit?: number },
): GarminDailyRow[] {
  const from = opts?.from_ms ?? 0
  const to = opts?.to_ms ?? Number.MAX_SAFE_INTEGER
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100))
  return s.garmin
    .filter((e) => e.logged_at >= from && e.logged_at <= to)
    .sort((a, b) => b.logged_at - a.logged_at)
    .slice(0, limit)
}

export function listGarminForRangeArg(
  s: HealthStore,
  args?: { start_date?: unknown; end_date?: unknown; date?: unknown; limit?: number },
): GarminDailyRow[] {
  const range = resolveRangeBounds(args ?? {})
  return listGarminDaily(s, {
    from_ms: range.start_ms,
    to_ms: range.end_ms,
    limit: args?.limit,
  })
}

export function buildGarminRangeSummary(
  s: HealthStore,
  args?: { start_date?: unknown; end_date?: unknown; date?: unknown; limit?: number },
): GarminRangeSummary {
  const range = resolveRangeBounds(args ?? {})
  const entries = listGarminForRangeArg(s, { ...args, limit: args?.limit ?? 500 })
  return {
    start_date: range.start_date,
    end_date: range.end_date,
    entry_count: entries.length,
    entries,
  }
}

/** Return a copy of a GarminDailyRow with raw_json stripped.
 *  Use in tool responses to keep LLM context small — the raw dump is
 *  retained in the ndjson store for analytics and re-extraction. */
export function stripRawJson(entry: GarminDailyRow): Omit<GarminDailyRow, 'raw_json'> {
  const { raw_json: _raw, ...rest } = entry
  return rest
}

/** Strip raw_json from an array of entries. */
export function stripRawJsonEntries(entries: GarminDailyRow[]): Omit<GarminDailyRow, 'raw_json'>[] {
  return entries.map(stripRawJson)
}

/** Seconds → hours, rounded to 1 decimal. null-safe. */
function secToHrs(sec: number | null): number | null {
  if (sec == null) return null
  return Math.round((sec / 3600) * 10) / 10
}

/** Compute min/avg/max for an array of numbers (nulls skipped).
 *  `total` is the denominator for coverage disclosure — the AI uses
 *  count/total to report "based on N of M days". */
function metricAgg(values: (number | null)[], total: number): GarminMetricAgg | null {
  const nums = values.filter((v): v is number => v != null)
  if (nums.length === 0) return null
  const sum = nums.reduce((a, b) => a + b, 0)
  return {
    min: Math.min(...nums),
    avg: Math.round((sum / nums.length) * 10) / 10,
    max: Math.max(...nums),
    count: nums.length,
    total,
  }
}

/** Convert a stored GarminDailyRow into a compact GarminReportDay with
 *  computed human-readable fields (hours, percentages, nested groups). */
function toReportDay(entry: GarminDailyRow): GarminReportDay {
  const local = formatLocalLoggedAt(entry.logged_at)
  return {
    date: entry.date,
    day_of_week: local.logged_day_of_week ?? '',
    updated_at: entry.updated_at,
    training_readiness: {
      score: entry.training_readiness_score,
      level: entry.training_readiness_level,
      feedback: entry.training_readiness_feedback,
    },
    body_battery: {
      charged: entry.body_battery_charged,
      drained: entry.body_battery_drained,
      end_level: entry.body_battery_end_level,
    },
    hrv: {
      avg: entry.hrv_avg,
      high: entry.hrv_5min_high,
      status: entry.hrv_status,
      weekly_avg: entry.hrv_weekly_avg,
      baseline_balanced_low: entry.hrv_baseline_balanced_low,
    },
    sleep: {
      total_hours: secToHrs(entry.sleep_seconds),
      deep_hours: secToHrs(entry.deep_sleep_seconds),
      deep_pct: entry.deep_sleep_pct,
      rem_hours: secToHrs(entry.rem_sleep_seconds),
      rem_pct: entry.rem_sleep_pct,
      light_hours: secToHrs(entry.light_sleep_seconds),
      awake_hours: secToHrs(entry.awake_sleep_seconds),
      score: entry.sleep_score,
      score_qualifier: entry.sleep_score_qualifier,
      feedback: entry.sleep_feedback,
      insight: entry.sleep_insight,
      personalized_insight: entry.sleep_personalized_insight,
      avg_hr: entry.sleep_avg_hr,
      avg_stress: entry.sleep_avg_stress,
      awake_count: entry.sleep_awake_count,
      lowest_spo2: entry.sleep_lowest_spo2,
    },
    vitals: {
      resting_hr: entry.resting_hr,
      max_hr: entry.max_hr,
      min_hr: entry.min_hr,
      rhr_7day_avg: entry.rhr_7day_avg,
      spo2_avg: entry.spo2_avg,
      spo2_min: entry.spo2_min,
      spo2_7day_avg: entry.spo2_7day_avg,
      respiration_avg: entry.respiration_avg,
      stress_avg: entry.stress_avg,
      stress_max: entry.stress_max,
      vo2_max: entry.vo2_max,
      fitness_age: entry.fitness_age,
    },
    activity: {
      steps: entry.steps,
      distance_km: entry.distance_m != null ? Math.round((entry.distance_m / 1000) * 100) / 100 : null,
      floors: entry.floors,
      calories_total: entry.calories_total,
      calories_active: entry.calories_active,
    },
  }
}

/** Build a compact, LLM-optimized Garmin report for a date range.
 *  Returns per-day summaries (no raw_json) plus min/avg/max aggregates
 *  for key recovery metrics. Designed to keep LLM context small while
 *  giving the agent everything it needs for coaching decisions. */
export function buildGarminReport(
  s: HealthStore,
  args?: { start_date?: unknown; end_date?: unknown; date?: unknown; limit?: number },
): GarminReport {
  const range = resolveRangeBounds(args ?? {})
  const entries = listGarminForRangeArg(s, { ...args, limit: args?.limit ?? 500 })
  const days = entries.map(toReportDay)

  // Collect metric arrays for aggregation
  const trScores = entries.map((e) => e.training_readiness_score)
  const bbCharged = entries.map((e) => e.body_battery_charged)
  const hrvAvgs = entries.map((e) => e.hrv_avg)
  const deepHrs = entries.map((e) => secToHrs(e.deep_sleep_seconds))
  const sleepScores = entries.map((e) => e.sleep_score)
  const stressAvgs = entries.map((e) => e.stress_avg)
  const rhrs = entries.map((e) => e.resting_hr)
  const spo2Avgs = entries.map((e) => e.spo2_avg)

  const total = entries.length
  return {
    start_date: range.start_date,
    end_date: range.end_date,
    day_count: days.length,
    days,
    aggregates: {
      training_readiness: metricAgg(trScores, total),
      body_battery_charged: metricAgg(bbCharged, total),
      hrv_avg: metricAgg(hrvAvgs, total),
      deep_sleep_hours: metricAgg(deepHrs, total),
      sleep_score: metricAgg(sleepScores, total),
      stress_avg: metricAgg(stressAvgs, total),
      resting_hr: metricAgg(rhrs, total),
      spo2_avg: metricAgg(spo2Avgs, total),
    },
  }
}