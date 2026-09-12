// Health data layer for the Sylo host plugin (moved from sylo-dev
// apps/host/src/main/health-db.ts on 2026-09-01 as part of the personal-plugin
// split — no personal-domain code remains in sylo-dev).
//
// Reads/writes the git-synced JSON store at the resolved data dir (default
// `<sylo-user>/health`). A fresh HealthStore is opened per call so the UI
// always sees the latest on-disk data (small files — cheap to load).
import {
  buildDailySummariesForRangeArg,
  buildDailySummaryForDateArg,
  enrichMealLogEntries,
  getHealthProfile,
  listMealLogsForRangeArg,
} from '../shared/nutrition-store.js'
import {
  enrichJournalEntries,
  listJournalForRangeArg,
} from '../shared/journal-store.js'
import {
  buildMuscleSummary,
  buildWorkoutRangeSummary,
  deleteWorkoutLog,
  enrichWorkoutEntries,
  enrichWorkoutEntry,
  getWorkoutById,
  insertWorkoutLog,
  listWorkoutsForRangeArg,
  searchExerciseHistory,
  updateWorkoutLog,
} from '../shared/workout-store.js'
import type { WorkoutExercise } from '../shared/types.js'
import type { WorkoutStatus } from '../shared/workout-constants.js'
import {
  buildWeightRangeSummary,
  enrichWeightEntries,
  listWeightsForRangeArg,
} from '../shared/weight-store.js'
import {
  enrichPlan,
  enrichPlans,
  getActivePlan,
  listWorkoutPlans,
} from '../shared/plan-store.js'
import { HealthStore } from '../shared/health-store.js'

export type HealthRangeArgs = {
  date?: unknown
  start_date?: unknown
  end_date?: unknown
  limit?: number
  status?: unknown
  include_planned?: boolean
}

export type HealthExerciseHistoryArgs = {
  name?: unknown
  limit?: number
}

export function createHealthDb(dataDir: () => string) {
  function store(): HealthStore {
    return new HealthStore(dataDir())
  }

  return {
    healthProfileGet() {
      return getHealthProfile(store())
    },

    healthDailySummary(date?: unknown) {
      return buildDailySummaryForDateArg(store(), date)
    },

    healthDailySummaries(args?: HealthRangeArgs) {
      return buildDailySummariesForRangeArg(store(), args ?? {})
    },

    healthLogList(args?: HealthRangeArgs) {
      const entries = listMealLogsForRangeArg(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        limit: args?.limit,
      })
      return enrichMealLogEntries(entries)
    },

    healthWorkoutList(args?: HealthRangeArgs) {
      const entries = listWorkoutsForRangeArg(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        limit: args?.limit,
        status: args?.status,
      })
      return enrichWorkoutEntries(entries)
    },

    healthWorkoutSummary(args?: HealthRangeArgs) {
      const summary = buildWorkoutRangeSummary(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        limit: args?.limit,
        status: args?.status,
      })
      return {
        ...summary,
        entries: enrichWorkoutEntries(summary.entries),
      }
    },

    healthExerciseHistory(args?: HealthExerciseHistoryArgs) {
      const name = String(args?.name ?? '').trim()
      if (!name) return []
      return searchExerciseHistory(store(), {
        name,
        limit: args?.limit,
      })
    },

    healthWorkoutLog(args?: {
      title?: unknown
      description?: unknown
      duration_min?: unknown
      calories_burned?: unknown
      exercises?: unknown
      notes?: unknown
      status?: unknown
      date?: unknown
      logged_at?: unknown
    }) {
      const result = insertWorkoutLog(store(), {
        title: typeof args?.title === 'string' ? args.title : '',
        description: typeof args?.description === 'string' ? args.description : undefined,
        duration_min: typeof args?.duration_min === 'number' ? args.duration_min : undefined,
        calories_burned: typeof args?.calories_burned === 'number' ? args.calories_burned : undefined,
        exercises: Array.isArray(args?.exercises) ? (args.exercises as WorkoutExercise[]) : undefined,
        notes: typeof args?.notes === 'string' ? args.notes : undefined,
        status: typeof args?.status === 'string' ? (args.status as WorkoutStatus) : undefined,
        date: args?.date,
        logged_at: args?.logged_at,
      })
      return {
        entry: result.entry ? enrichWorkoutEntry(result.entry) : null,
        replaced_planned: result.replaced_planned,
      }
    },

    healthWorkoutUpdate(args?: {
      id?: unknown
      title?: unknown
      description?: unknown
      duration_min?: unknown
      calories_burned?: unknown
      exercises?: unknown
      notes?: unknown
      status?: unknown
      date?: unknown
      logged_at?: unknown
    }) {
      const id = typeof args?.id === 'string' ? args.id : ''
      if (!id) throw new Error('missing_id')
      const patch: Parameters<typeof updateWorkoutLog>[2] = {}
      if (typeof args?.title === 'string') patch.title = args.title
      if (typeof args?.description === 'string') patch.description = args.description
      if (args?.duration_min !== undefined)
        patch.duration_min = typeof args.duration_min === 'number' ? args.duration_min : null
      if (args?.calories_burned !== undefined)
        patch.calories_burned = typeof args.calories_burned === 'number' ? args.calories_burned : null
      if (Array.isArray(args?.exercises)) patch.exercises = args.exercises as WorkoutExercise[]
      if (args?.notes !== undefined)
        patch.notes = typeof args.notes === 'string' ? args.notes : null
      if (typeof args?.status === 'string') patch.status = args.status as WorkoutStatus
      if (args?.date !== undefined) patch.date = args.date
      if (args?.logged_at !== undefined) patch.logged_at = args.logged_at
      const updated = updateWorkoutLog(store(), id, patch)
      if (!updated) throw new Error('workout_not_found')
      return enrichWorkoutEntry(updated)
    },

    healthWorkoutDelete(args?: { id?: unknown }) {
      const id = typeof args?.id === 'string' ? args.id : ''
      if (!id) throw new Error('missing_id')
      const ok = deleteWorkoutLog(store(), id)
      if (!ok) throw new Error('workout_not_found')
      return { ok: true }
    },

    healthWorkoutGet(args?: { id?: unknown }) {
      const id = typeof args?.id === 'string' ? args.id : ''
      if (!id) throw new Error('missing_id')
      const entry = getWorkoutById(store(), id)
      return entry ? enrichWorkoutEntry(entry) : null
    },

    healthMuscleSummary(args?: HealthRangeArgs) {
      return buildMuscleSummary(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        include_planned: args?.include_planned === true,
      })
    },

    healthWeightList(args?: HealthRangeArgs) {
      const entries = listWeightsForRangeArg(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        limit: args?.limit,
      })
      return enrichWeightEntries(entries)
    },

    healthWeightSummary(args?: HealthRangeArgs) {
      const summary = buildWeightRangeSummary(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        limit: args?.limit,
      })
      return {
        ...summary,
        entries: enrichWeightEntries(summary.entries),
      }
    },

    healthPlanActive() {
      const plan = getActivePlan(store())
      return plan ? enrichPlan(plan) : null
    },

    healthPlanList(args?: { limit?: number }) {
      return enrichPlans(listWorkoutPlans(store(), { limit: args?.limit }))
    },

    healthJournalList(args?: HealthRangeArgs) {
      const entries = listJournalForRangeArg(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        limit: args?.limit,
      })
      return enrichJournalEntries(entries)
    },
  }
}