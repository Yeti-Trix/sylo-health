import { randomUUID } from 'node:crypto'

import {
  eachDayInRange,
  formatLocalLoggedAt,
  localDayBounds,
  localDayOfWeekFromDate,
  resolveDateMs,
  resolveRangeBounds,
} from './date-range.js'
import { computeMacroTargets, type ProfileInput } from './tdee.js'
import { kgToLb, resolveProfileWeights } from './weight-units.js'
import {
  monthKeyFromLoggedAt,
  openHealthStore,
  type HealthStore,
} from './health-store.js'

export { localDayBounds, resolveDateMs } from './date-range.js'
// Back-compat: extensions import `openHealthDb` from here. It now returns a
// JSON-backed HealthStore (no-op close) instead of a SQLite Database.
export { openHealthStore as openHealthDb } from './health-store.js'
export type { HealthStore }

import type {
  DailySummary,
  HealthActivityLevel,
  HealthProfileRow,
  HealthSex,
  MealLogEntryRow,
  MealLogItem,
  MealLogSource,
} from './types.js'

const PROFILE_ID = 'default'

export function enrichMealLogEntry(entry: MealLogEntryRow): MealLogEntryRow {
  const local = formatLocalLoggedAt(entry.logged_at)
  return {
    ...entry,
    logged_date: local.logged_date,
    logged_day_of_week: local.logged_day_of_week,
    logged_time: local.logged_time,
    logged_datetime_local: local.logged_datetime_local,
  }
}

export function enrichMealLogEntries(entries: MealLogEntryRow[]): MealLogEntryRow[] {
  return entries.map(enrichMealLogEntry)
}

function normalizeItems(items: MealLogItem[]): MealLogItem[] {
  return items.map((it) => ({
    name: String(it.name ?? '').trim() || 'item',
    serving: it.serving != null ? String(it.serving) : undefined,
    calories: Math.round(Number(it.calories) || 0),
    protein_g: round1(Number(it.protein_g) || 0),
    carbs_g: round1(Number(it.carbs_g) || 0),
    fat_g: round1(Number(it.fat_g) || 0),
  }))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function sumItems(items: MealLogItem[]): {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
} {
  return items.reduce(
    (acc, it) => ({
      calories: acc.calories + it.calories,
      protein_g: round1(acc.protein_g + it.protein_g),
      carbs_g: round1(acc.carbs_g + it.carbs_g),
      fat_g: round1(acc.fat_g + it.fat_g),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  )
}

export function getHealthProfile(s: HealthStore): HealthProfileRow | null {
  return s.profile
}

export function setHealthProfile(s: HealthStore, input: ProfileInput): HealthProfileRow {
  const targets = computeMacroTargets(input)
  const now = Date.now()
  const worksOut = input.works_out === true ? 1 : 0
  s.profile = {
    id: PROFILE_ID,
    height_cm: input.height_cm,
    weight_lb: input.weight_lb,
    weight_kg: input.weight_kg,
    age_years: input.age_years,
    sex: input.sex,
    activity_level: input.activity_level,
    works_out: worksOut,
    target_weight_lb: input.target_weight_lb,
    target_weight_kg: input.target_weight_kg,
    target_weeks: input.target_weeks ?? null,
    daily_calorie_target: targets.daily_calorie_target,
    protein_g_target: targets.protein_g_target,
    carbs_g_target: targets.carbs_g_target,
    fat_g_target: targets.fat_g_target,
    updated_at: now,
  }
  s.saveProfile()
  return s.profile
}

export function insertMealLog(
  s: HealthStore,
  args: {
    description: string
    items: MealLogItem[]
    source: MealLogSource
    logged_at?: number
    notes?: string | null
    calories?: number
    protein_g?: number
    carbs_g?: number
    fat_g?: number
  },
): MealLogEntryRow {
  const items = normalizeItems(args.items)
  const summed = sumItems(items)
  const now = Date.now()
  const loggedAt = args.logged_at ?? now
  const id = randomUUID()
  const calories = args.calories ?? summed.calories
  const protein_g = args.protein_g ?? summed.protein_g
  const carbs_g = args.carbs_g ?? summed.carbs_g
  const fat_g = args.fat_g ?? summed.fat_g

  const entry: MealLogEntryRow = {
    id,
    logged_at: loggedAt,
    description: args.description.trim() || items.map((i) => i.name).join(', '),
    items,
    calories: Math.round(calories),
    protein_g,
    carbs_g,
    fat_g,
    source: args.source,
    notes: args.notes ?? null,
    updated_at: now,
  }
  s.meals.push(entry)
  s.appendLog('meals', entry)
  return entry
}

export function getMealLogById(s: HealthStore, id: string): MealLogEntryRow | null {
  return s.meals.find((e) => e.id === id) ?? null
}

export function updateMealLog(
  s: HealthStore,
  id: string,
  patch: {
    description?: string
    items?: MealLogItem[]
    source?: MealLogSource
    logged_at?: number
    notes?: string | null
    calories?: number
    protein_g?: number
    carbs_g?: number
    fat_g?: number
  },
): MealLogEntryRow | null {
  const existing = getMealLogById(s, id)
  if (!existing) return null

  const oldMonth = monthKeyFromLoggedAt(existing.logged_at)
  const items = patch.items != null ? normalizeItems(patch.items) : existing.items
  const summed = sumItems(items)
  const now = Date.now()

  const merged: MealLogEntryRow = {
    ...existing,
    description: patch.description?.trim() || existing.description,
    items,
    calories: Math.round(patch.calories ?? summed.calories),
    protein_g: patch.protein_g ?? summed.protein_g,
    carbs_g: patch.carbs_g ?? summed.carbs_g,
    fat_g: patch.fat_g ?? summed.fat_g,
    source: patch.source ?? existing.source,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    logged_at: patch.logged_at ?? existing.logged_at,
    updated_at: now,
  }

  const idx = s.meals.findIndex((e) => e.id === id)
  s.meals[idx] = merged

  const newMonth = monthKeyFromLoggedAt(merged.logged_at)
  s.rewriteLogMonth('meals', oldMonth)
  if (newMonth !== oldMonth) s.rewriteLogMonth('meals', newMonth)
  return merged
}

export function deleteMealLog(s: HealthStore, id: string): boolean {
  const existing = getMealLogById(s, id)
  if (!existing) return false
  const oldMonth = monthKeyFromLoggedAt(existing.logged_at)
  s.meals = s.meals.filter((e) => e.id !== id)
  s.rewriteLogMonth('meals', oldMonth)
  return true
}

export function listMealLogs(
  s: HealthStore,
  opts?: { from_ms?: number; to_ms?: number; limit?: number },
): MealLogEntryRow[] {
  const from = opts?.from_ms ?? 0
  const to = opts?.to_ms ?? Number.MAX_SAFE_INTEGER
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100))
  return s.meals
    .filter((e) => e.logged_at >= from && e.logged_at <= to)
    .sort((a, b) => b.logged_at - a.logged_at)
    .slice(0, limit)
}

export function aggregateDay(
  s: HealthStore,
  dateMs?: number,
): { consumed: DailySummary['consumed']; entry_count: number } {
  const { start, end } = localDayBounds(dateMs ?? Date.now())
  const dayEntries = s.meals.filter((e) => e.logged_at >= start && e.logged_at <= end)
  const consumed = dayEntries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein_g: round1(acc.protein_g + e.protein_g),
      carbs_g: round1(acc.carbs_g + e.carbs_g),
      fat_g: round1(acc.fat_g + e.fat_g),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  )
  return { consumed, entry_count: dayEntries.length }
}

export function buildDailySummary(s: HealthStore, dateMs?: number): DailySummary | null {
  const profile = getHealthProfile(s)
  if (!profile) return null
  const bounds = localDayBounds(dateMs ?? Date.now())
  const { consumed, entry_count } = aggregateDay(s, dateMs)
  const targets = {
    calories: profile.daily_calorie_target,
    protein_g: profile.protein_g_target,
    carbs_g: profile.carbs_g_target,
    fat_g: profile.fat_g_target,
  }
  return {
    date: bounds.date,
    day_of_week: localDayOfWeekFromDate(bounds.date),
    day_start_ms: bounds.start,
    day_end_ms: bounds.end,
    targets,
    consumed,
    remaining: {
      calories: targets.calories - consumed.calories,
      protein_g: round1(targets.protein_g - consumed.protein_g),
      carbs_g: round1(targets.carbs_g - consumed.carbs_g),
      fat_g: round1(targets.fat_g - consumed.fat_g),
    },
    entry_count,
  }
}

const ACTIVITY_LEVELS: Record<HealthActivityLevel, true> = {
  sedentary: true,
  light: true,
  moderate: true,
  active: true,
  very_active: true,
}

export function validateProfileParams(raw: Record<string, unknown>): string | null {
  const hasWeight =
    (typeof raw.weight_lb === 'number' && Number.isFinite(raw.weight_lb)) ||
    (typeof raw.weight_kg === 'number' && Number.isFinite(raw.weight_kg))
  const hasTarget =
    (typeof raw.target_weight_lb === 'number' && Number.isFinite(raw.target_weight_lb)) ||
    (typeof raw.target_weight_kg === 'number' && Number.isFinite(raw.target_weight_kg))
  if (!hasWeight) return 'weight_lb or weight_kg is required.'
  if (!hasTarget) return 'target_weight_lb or target_weight_kg is required.'
  return null
}

export function parseProfileInput(raw: Record<string, unknown>): ProfileInput {
  const sex = String(raw.sex ?? 'other') as HealthSex
  const activity = String(raw.activity_level ?? 'moderate') as HealthActivityLevel
  const weights = resolveProfileWeights(raw)
  return {
    height_cm: Number(raw.height_cm),
    weight_lb: weights.weight_lb,
    weight_kg: weights.weight_kg,
    age_years: Math.floor(Number(raw.age_years)),
    sex: sex === 'male' || sex === 'female' || sex === 'other' ? sex : 'other',
    activity_level: activity in ACTIVITY_LEVELS ? activity : 'moderate',
    works_out: raw.works_out === true || raw.works_out === 1,
    target_weight_lb: weights.target_weight_lb,
    target_weight_kg: weights.target_weight_kg,
    target_weeks:
      raw.target_weeks != null && raw.target_weeks !== '' ? Math.floor(Number(raw.target_weeks)) : null,
  }
}

export function validateProfileInput(input: ProfileInput): string | null {
  if (!Number.isFinite(input.height_cm) || input.height_cm < 50 || input.height_cm > 280) {
    return 'height_cm must be between 50 and 280.'
  }
  if (!Number.isFinite(input.weight_kg) || input.weight_kg < 20 || input.weight_kg > 500) {
    return 'weight_kg must be between 20 and 500.'
  }
  if (!Number.isFinite(input.age_years) || input.age_years < 10 || input.age_years > 120) {
    return 'age_years must be between 10 and 120.'
  }
  if (!Number.isFinite(input.target_weight_kg) || input.target_weight_kg < 20 || input.target_weight_kg > 500) {
    return 'target_weight_kg must be between 20 and 500.'
  }
  if (input.target_weeks != null && (input.target_weeks < 1 || input.target_weeks > 520)) {
    return 'target_weeks must be between 1 and 520 when set.'
  }
  return null
}

export function listMealLogsForRangeArg(
  s: HealthStore,
  args?: { start_date?: unknown; end_date?: unknown; date?: unknown; limit?: number },
) {
  const range = resolveRangeBounds(args ?? {})
  return listMealLogs(s, {
    from_ms: range.start_ms,
    to_ms: range.end_ms,
    limit: args?.limit,
  })
}

/** @deprecated Use listMealLogsForRangeArg */
export function listMealLogsForDateArg(s: HealthStore, date?: unknown, limit?: number) {
  return listMealLogsForRangeArg(s, { date, limit })
}

export function buildDailySummaryForDateArg(
  s: HealthStore,
  date?: unknown,
): DailySummary | null {
  return buildDailySummary(s, resolveDateMs(date))
}

export function buildDailySummariesForRangeArg(
  s: HealthStore,
  args?: { start_date?: unknown; end_date?: unknown; date?: unknown },
): DailySummary[] {
  const profile = getHealthProfile(s)
  if (!profile) return []
  const range = resolveRangeBounds(args ?? {})
  const out: DailySummary[] = []
  for (const dayMs of eachDayInRange(range.start_ms, range.end_ms)) {
    const summ = buildDailySummary(s, dayMs)
    if (summ) out.push(summ)
  }
  return out
}