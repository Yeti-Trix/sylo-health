import { randomUUID } from 'node:crypto'

import { formatLocalLoggedAt, resolveLoggedAt, resolveRangeBounds } from './date-range.js'
import { getHealthProfile, setHealthProfile } from './nutrition-store.js'
import { monthKeyFromLoggedAt, type HealthStore } from './health-store.js'
import type { ProfileInput } from './tdee.js'
import type { WeightLogEntryRow, WeightRangeSummary } from './types.js'
import { kgToLb, resolveBodyWeight, round1 } from './weight-units.js'

export function enrichWeightEntry(entry: WeightLogEntryRow): WeightLogEntryRow {
  const local = formatLocalLoggedAt(entry.logged_at)
  return {
    ...entry,
    logged_date: local.logged_date,
    logged_day_of_week: local.logged_day_of_week,
    logged_time: local.logged_time,
    logged_datetime_local: local.logged_datetime_local,
  }
}

export function enrichWeightEntries(entries: WeightLogEntryRow[]): WeightLogEntryRow[] {
  return entries.map(enrichWeightEntry)
}

/** Sync profile.weight_kg + calorie targets from the latest weigh-in when a profile exists. */
export function refreshProfileWeightFromLog(s: HealthStore): void {
  const profile = getHealthProfile(s)
  if (!profile) return
  const latest = getLatestWeightEntry(s)
  if (!latest) return
  const input: ProfileInput = {
    height_cm: profile.height_cm,
    weight_lb: latest.weight_lb,
    weight_kg: latest.weight_kg,
    age_years: profile.age_years,
    sex: profile.sex,
    activity_level: profile.activity_level,
    works_out: profile.works_out === 1,
    target_weight_lb: profile.target_weight_lb,
    target_weight_kg: profile.target_weight_kg,
    target_weeks: profile.target_weeks,
  }
  setHealthProfile(s, input)
}

export function getLatestWeightEntry(s: HealthStore): WeightLogEntryRow | null {
  if (s.weights.length === 0) return null
  return s.weights.reduce((best, e) => (e.logged_at > best.logged_at ? e : best), s.weights[0])
}

export function getWeightById(s: HealthStore, id: string): WeightLogEntryRow | null {
  return s.weights.find((e) => e.id === id) ?? null
}

export function insertWeightLog(
  s: HealthStore,
  args: {
    weight_lb?: number
    weight_kg?: number
    source?: string
    notes?: string | null
    date?: unknown
    logged_at?: unknown
  },
): WeightLogEntryRow {
  const { weight_lb, weight_kg } = resolveBodyWeight(args)
  const now = Date.now()
  const id = randomUUID()
  const loggedAt = resolveLoggedAt({ date: args.date, logged_at: args.logged_at })
  const source = String(args.source ?? 'operator_manual').trim() || 'operator_manual'

  const entry: WeightLogEntryRow = {
    id,
    logged_at: loggedAt,
    weight_lb,
    weight_kg,
    source,
    notes: args.notes ?? null,
    updated_at: now,
  }
  s.weights.push(entry)
  s.appendLog('weights', entry)

  refreshProfileWeightFromLog(s)
  return entry
}

export function updateWeightLog(
  s: HealthStore,
  id: string,
  patch: {
    weight_lb?: number
    weight_kg?: number
    source?: string
    notes?: string | null
    date?: unknown
    logged_at?: unknown
  },
): WeightLogEntryRow | null {
  const existing = getWeightById(s, id)
  if (!existing) return null
  const oldMonth = monthKeyFromLoggedAt(existing.logged_at)
  const now = Date.now()
  let loggedAt = existing.logged_at
  if (patch.logged_at !== undefined || patch.date !== undefined) {
    loggedAt = resolveLoggedAt({ date: patch.date, logged_at: patch.logged_at })
  }

  let weight_lb = existing.weight_lb
  let weight_kg = existing.weight_kg
  if (patch.weight_lb !== undefined || patch.weight_kg !== undefined) {
    const resolved = resolveBodyWeight(
      patch.weight_lb !== undefined ?
        { weight_lb: patch.weight_lb }
      : { weight_kg: patch.weight_kg as number },
    )
    weight_lb = resolved.weight_lb
    weight_kg = resolved.weight_kg
  }

  const merged: WeightLogEntryRow = {
    ...existing,
    weight_lb,
    weight_kg,
    source:
      patch.source != null ? String(patch.source).trim() || existing.source : existing.source,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    logged_at: loggedAt,
    updated_at: now,
  }

  const idx = s.weights.findIndex((e) => e.id === id)
  s.weights[idx] = merged

  const newMonth = monthKeyFromLoggedAt(merged.logged_at)
  s.rewriteLogMonth('weights', oldMonth)
  if (newMonth !== oldMonth) s.rewriteLogMonth('weights', newMonth)

  refreshProfileWeightFromLog(s)
  return merged
}

export function deleteWeightLog(s: HealthStore, id: string): boolean {
  const existing = getWeightById(s, id)
  if (!existing) return false
  const oldMonth = monthKeyFromLoggedAt(existing.logged_at)
  s.weights = s.weights.filter((e) => e.id !== id)
  s.rewriteLogMonth('weights', oldMonth)
  refreshProfileWeightFromLog(s)
  return true
}

export function listWeightLogs(
  s: HealthStore,
  opts?: { from_ms?: number; to_ms?: number; limit?: number },
): WeightLogEntryRow[] {
  const from = opts?.from_ms ?? 0
  const to = opts?.to_ms ?? Number.MAX_SAFE_INTEGER
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100))
  return s.weights
    .filter((e) => e.logged_at >= from && e.logged_at <= to)
    .sort((a, b) => b.logged_at - a.logged_at)
    .slice(0, limit)
}

export function listWeightsForRangeArg(
  s: HealthStore,
  args?: { start_date?: unknown; end_date?: unknown; date?: unknown; limit?: number },
): WeightLogEntryRow[] {
  const range = resolveRangeBounds(args ?? {})
  return listWeightLogs(s, {
    from_ms: range.start_ms,
    to_ms: range.end_ms,
    limit: args?.limit,
  })
}

export function buildWeightRangeSummary(
  s: HealthStore,
  args?: { start_date?: unknown; end_date?: unknown; date?: unknown; limit?: number },
): WeightRangeSummary {
  const range = resolveRangeBounds(args ?? {})
  const entries = listWeightsForRangeArg(s, { ...args, limit: args?.limit ?? 500 })
  const profile = getHealthProfile(s)
  const latest = getLatestWeightEntry(s)
  const chronological = [...entries].sort((a, b) => a.logged_at - b.logged_at)
  const first = chronological[0]
  const last = chronological[chronological.length - 1]
  const change_kg =
    first && last && first.id !== last.id ?
      round1(last.weight_kg - first.weight_kg)
    : 0
  const change_lb =
    first && last && first.id !== last.id ?
      round1(last.weight_lb - first.weight_lb)
    : 0

  return {
    start_date: range.start_date,
    end_date: range.end_date,
    entry_count: entries.length,
    latest_weight_lb: latest?.weight_lb ?? (latest ? kgToLb(latest.weight_kg) : null),
    latest_weight_kg: latest?.weight_kg ?? profile?.weight_kg ?? null,
    target_weight_lb: profile?.target_weight_lb ?? null,
    target_weight_kg: profile?.target_weight_kg ?? null,
    change_lb,
    change_kg,
    entries,
  }
}