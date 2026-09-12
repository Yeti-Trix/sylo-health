import { randomUUID } from 'node:crypto'

import { formatLocalLoggedAt, localDayBounds, resolveLoggedAt, resolveRangeBounds } from './date-range.js'
import { monthKeyFromLoggedAt, type HealthStore } from './health-store.js'
import {
  normalizeMuscleGroups,
  normalizeWorkoutStatus,
  type WorkoutStatus,
} from './workout-constants.js'
import type {
  ExerciseHistoryHit,
  MuscleGroupSummaryRow,
  MuscleRangeSummary,
  InsertWorkoutLogResult,
  WorkoutExercise,
  WorkoutLogEntryRow,
  WorkoutRangeSummary,
  WorkoutSetEntry,
} from './types.js'
import { resolveExerciseWeight } from './weight-units.js'

export function enrichWorkoutEntry(entry: WorkoutLogEntryRow): WorkoutLogEntryRow {
  const local = formatLocalLoggedAt(entry.logged_at)
  return {
    ...entry,
    logged_date: local.logged_date,
    logged_day_of_week: local.logged_day_of_week,
    logged_time: local.logged_time,
    logged_datetime_local: local.logged_datetime_local,
  }
}

export function enrichWorkoutEntries(entries: WorkoutLogEntryRow[]): WorkoutLogEntryRow[] {
  return entries.map(enrichWorkoutEntry)
}

export function normalizeExercises(raw: WorkoutExercise[]): WorkoutExercise[] {
  return raw.map((ex) => {
    const weights = resolveExerciseWeight({
      weight_lb: ex.weight_lb,
      weight_kg: ex.weight_kg,
    })

    // Per-set breakdown (companion tracker). Normalize each entry; derive the
    // legacy flat fields from it when they are absent so existing volume math
    // (sets×reps×weight) keeps working unchanged.
    let setList: WorkoutSetEntry[] | undefined
    if (Array.isArray(ex.set_list)) {
      setList = ex.set_list
        .filter((s): s is WorkoutSetEntry => s != null && typeof s === 'object')
        .map((s) => {
          const roundLb = (v: unknown): number | undefined => {
            if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined
            return Math.round(v * 10) / 10
          }
          const weightLb = roundLb(s.weight_lb)
          const weightKg = weightLb != null ? Math.round((weightLb / 2.2046226218) * 100) / 100 : roundLb(s.weight_kg)
          return {
            done: s.done === true,
            weight_lb: weightLb,
            weight_kg: weightKg,
            reps: typeof s.reps === 'number' && Number.isFinite(s.reps) ? Math.max(0, Math.floor(s.reps)) : undefined,
          }
        })
    }

    const derivedSets =
      setList != null && setList.length > 0 ? setList.length : undefined
    const setWeights =
      setList != null && setList.length > 0 ?
        setList.map((s) => s.weight_lb ?? 0).reduce((a, b) => Math.max(a, b), 0)
      : undefined

    return {
      name: String(ex.name ?? '').trim() || 'exercise',
      sets:
        ex.sets != null ? Math.floor(Number(ex.sets))
        : derivedSets != null ? derivedSets
        : undefined,
      reps: ex.reps != null ? Math.floor(Number(ex.reps)) : undefined,
      ...weights,
      set_list: setList,
      // Keep the top-level weight meaningful when only per-set weights exist.
      ...(setWeights != null && ex.weight_lb == null && ex.weight_kg == null && setWeights > 0
        ? { weight_lb: setWeights, weight_kg: Math.round(setWeights * 0.45359237 * 100) / 100 }
        : {}),
      duration_min: ex.duration_min != null ? Number(ex.duration_min) : undefined,
      notes: ex.notes != null ? String(ex.notes) : undefined,
      muscle_groups:
        ex.muscle_groups != null ? normalizeMuscleGroups(ex.muscle_groups) : undefined,
    }
  })
}

export function findPlannedWorkoutsOnDay(
  s: HealthStore,
  loggedAt: number,
): WorkoutLogEntryRow[] {
  const { start, end } = localDayBounds(loggedAt)
  return listWorkoutLogs(s, { from_ms: start, to_ms: end, status: 'planned', limit: 10 })
}

export function insertWorkoutLog(
  s: HealthStore,
  args: {
    title: string
    description?: string | null
    duration_min?: number | null
    calories_burned?: number | null
    exercises?: WorkoutExercise[]
    notes?: string | null
    status?: WorkoutStatus
    date?: unknown
    logged_at?: unknown
  },
): InsertWorkoutLogResult {
  const loggedAt = resolveLoggedAt({ date: args.date, logged_at: args.logged_at })
  const exercises = normalizeExercises(args.exercises ?? [])
  const status = normalizeWorkoutStatus(args.status)

  if (status === 'completed') {
    const planned = findPlannedWorkoutsOnDay(s, loggedAt)
    if (planned.length >= 1) {
      const target = planned[0]
      const entry = updateWorkoutLog(s, target.id, {
        title: args.title.trim() || target.title,
        description: args.description !== undefined ? args.description : target.description,
        duration_min: args.duration_min !== undefined ? args.duration_min : target.duration_min,
        calories_burned:
          args.calories_burned !== undefined ? args.calories_burned : target.calories_burned,
        exercises: args.exercises !== undefined ? exercises : target.exercises,
        notes: args.notes !== undefined ? args.notes : target.notes,
        status: 'completed',
        logged_at: loggedAt,
      })
      return { entry: entry!, replaced_planned: true }
    }
  }

  const now = Date.now()
  const id = randomUUID()
  const entry: WorkoutLogEntryRow = {
    id,
    logged_at: loggedAt,
    title: args.title.trim() || 'Workout',
    description: args.description ?? null,
    duration_min: args.duration_min ?? null,
    calories_burned: args.calories_burned ?? null,
    exercises,
    notes: args.notes ?? null,
    status,
    updated_at: now,
  }
  s.workouts.push(entry)
  s.appendLog('workouts', entry)
  return { entry, replaced_planned: false }
}

export function getWorkoutById(s: HealthStore, id: string): WorkoutLogEntryRow | null {
  return s.workouts.find((e) => e.id === id) ?? null
}

export function updateWorkoutLog(
  s: HealthStore,
  id: string,
  patch: {
    title?: string
    description?: string | null
    duration_min?: number | null
    calories_burned?: number | null
    exercises?: WorkoutExercise[]
    notes?: string | null
    status?: WorkoutStatus
    date?: unknown
    logged_at?: unknown
  },
): WorkoutLogEntryRow | null {
  const existing = getWorkoutById(s, id)
  if (!existing) return null
  const oldMonth = monthKeyFromLoggedAt(existing.logged_at)
  const now = Date.now()
  let loggedAt = existing.logged_at
  if (patch.logged_at !== undefined || patch.date !== undefined) {
    loggedAt = resolveLoggedAt({ date: patch.date, logged_at: patch.logged_at })
  }
  const exercises =
    patch.exercises != null ? normalizeExercises(patch.exercises) : existing.exercises
  const status = patch.status != null ? normalizeWorkoutStatus(patch.status) : existing.status

  const merged: WorkoutLogEntryRow = {
    ...existing,
    title: patch.title?.trim() || existing.title,
    description: patch.description !== undefined ? patch.description : existing.description,
    duration_min: patch.duration_min !== undefined ? patch.duration_min : existing.duration_min,
    calories_burned:
      patch.calories_burned !== undefined ? patch.calories_burned : existing.calories_burned,
    exercises,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    status,
    logged_at: loggedAt,
    updated_at: now,
  }

  const idx = s.workouts.findIndex((e) => e.id === id)
  s.workouts[idx] = merged

  const newMonth = monthKeyFromLoggedAt(merged.logged_at)
  s.rewriteLogMonth('workouts', oldMonth)
  if (newMonth !== oldMonth) s.rewriteLogMonth('workouts', newMonth)
  return merged
}

export function deleteWorkoutLog(s: HealthStore, id: string): boolean {
  const existing = getWorkoutById(s, id)
  if (!existing) return false
  const oldMonth = monthKeyFromLoggedAt(existing.logged_at)
  s.workouts = s.workouts.filter((e) => e.id !== id)
  s.rewriteLogMonth('workouts', oldMonth)
  return true
}

export function listWorkoutLogs(
  s: HealthStore,
  opts?: { from_ms?: number; to_ms?: number; limit?: number; status?: unknown },
): WorkoutLogEntryRow[] {
  const from = opts?.from_ms ?? 0
  const to = opts?.to_ms ?? Number.MAX_SAFE_INTEGER
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100))
  let rows = s.workouts.filter((e) => e.logged_at >= from && e.logged_at <= to)
  if (opts?.status != null && String(opts.status).trim() !== '') {
    const st = normalizeWorkoutStatus(opts.status)
    rows = rows.filter((e) => e.status === st)
  }
  return rows.sort((a, b) => b.logged_at - a.logged_at).slice(0, limit)
}

export function listWorkoutsForRangeArg(
  s: HealthStore,
  args?: {
    start_date?: unknown
    end_date?: unknown
    date?: unknown
    limit?: number
    status?: unknown
  },
): WorkoutLogEntryRow[] {
  const range = resolveRangeBounds(args ?? {})
  return listWorkoutLogs(s, {
    from_ms: range.start_ms,
    to_ms: range.end_ms,
    limit: args?.limit,
    status: args?.status,
  })
}

export function buildWorkoutRangeSummary(
  s: HealthStore,
  args?: {
    start_date?: unknown
    end_date?: unknown
    date?: unknown
    limit?: number
    status?: unknown
  },
): WorkoutRangeSummary {
  const range = resolveRangeBounds(args ?? {})
  const entries = listWorkoutsForRangeArg(s, { ...args, limit: args?.limit ?? 500 })
  let total_duration_min = 0
  let total_calories_burned = 0
  let completed_count = 0
  let planned_count = 0
  let skipped_count = 0
  for (const e of entries) {
    if (e.status === 'completed') completed_count += 1
    else if (e.status === 'planned') planned_count += 1
    else if (e.status === 'skipped') skipped_count += 1
    if (e.duration_min != null) total_duration_min += e.duration_min
    if (e.calories_burned != null) total_calories_burned += e.calories_burned
  }
  return {
    start_date: range.start_date,
    end_date: range.end_date,
    workout_count: entries.length,
    completed_count,
    planned_count,
    skipped_count,
    total_duration_min,
    total_calories_burned,
    entries,
  }
}

export function searchExerciseHistory(
  s: HealthStore,
  args: { name: string; limit?: number },
): ExerciseHistoryHit[] {
  const term = String(args.name ?? '').trim().toLowerCase()
  if (!term) return []
  const limit = Math.min(100, Math.max(1, args.limit ?? 20))
  const hits: ExerciseHistoryHit[] = []
  const ordered = [...s.workouts].sort((a, b) => b.logged_at - a.logged_at)
  for (const w of ordered) {
    for (const rawEx of w.exercises) {
      const name = String(rawEx.name ?? '').toLowerCase()
      if (name.includes(term)) {
        const exercise = normalizeExercises([rawEx])[0]
        const local = formatLocalLoggedAt(w.logged_at)
        hits.push({
          workout_id: w.id,
          workout_title: w.title,
          workout_status: w.status,
          logged_at: w.logged_at,
          logged_date: local.logged_date,
          logged_day_of_week: local.logged_day_of_week,
          logged_datetime_local: local.logged_datetime_local,
          exercise,
        })
        if (hits.length >= limit) return hits
      }
    }
  }
  return hits
}

export function buildMuscleSummary(
  s: HealthStore,
  args?: {
    start_date?: unknown
    end_date?: unknown
    date?: unknown
    include_planned?: boolean
  },
): MuscleRangeSummary {
  const range = resolveRangeBounds(args ?? {})
  const allowedStatuses: Set<WorkoutStatus> =
    args?.include_planned === true ? new Set(['completed', 'planned']) : new Set(['completed'])
  const rows = s.workouts.filter(
    (e) =>
      e.logged_at >= range.start_ms &&
      e.logged_at <= range.end_ms &&
      allowedStatuses.has(e.status),
  )

  const agg = new Map<string, MuscleGroupSummaryRow>()

  for (const w of rows) {
    const exercises = normalizeExercises(w.exercises)
    const sessionGroups = new Set<string>()
    for (const ex of exercises) {
      const groups = ex.muscle_groups ?? []
      const sets = ex.sets ?? 1
      const reps = ex.reps ?? 0
      const weight = ex.weight_kg ?? 0
      const volume = sets * reps * weight
      for (const g of groups) {
        sessionGroups.add(g)
        const cur = agg.get(g) ?? {
          muscle_group: g,
          session_count: 0,
          set_count: 0,
          rep_count: 0,
          volume_kg: 0,
        }
        cur.set_count += sets
        cur.rep_count += sets * reps
        cur.volume_kg = Math.round((cur.volume_kg + volume) * 10) / 10
        agg.set(g, cur)
      }
    }
    for (const g of sessionGroups) {
      const cur = agg.get(g)!
      cur.session_count += 1
      agg.set(g, cur)
    }
  }

  const groups = [...agg.values()].sort((a, b) => a.muscle_group.localeCompare(b.muscle_group))
  return {
    start_date: range.start_date,
    end_date: range.end_date,
    groups,
  }
}