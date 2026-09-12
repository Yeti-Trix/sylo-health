import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

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
} from '../../shared/workout-store.js'
import { healthToolOk } from '../../shared/health-tool-response.js'
import { openHealthDb } from '../../shared/nutrition-store.js'
import { MUSCLE_GROUPS } from '../../shared/workout-constants.js'
import type { WorkoutExercise, WorkoutLogEntryRow } from '../../shared/types.js'

type ToolContentBlock = { type: 'text'; text: string }

const dateRangeSchema = {
  date: Type.Optional(
    Type.String({
      description: 'Single calendar day (YYYY-MM-DD or ISO). Used when start_date/end_date omitted.',
    }),
  ),
  start_date: Type.Optional(
    Type.String({ description: 'Range start day inclusive (YYYY-MM-DD or ISO)' }),
  ),
  end_date: Type.Optional(
    Type.String({ description: 'Range end day inclusive (YYYY-MM-DD or ISO)' }),
  ),
}

const statusSchema = Type.Optional(
  Type.Union([
    Type.Literal('completed'),
    Type.Literal('planned'),
    Type.Literal('skipped'),
  ]),
)

const exerciseSchema = Type.Object({
  name: Type.String(),
  sets: Type.Optional(Type.Number()),
  reps: Type.Optional(Type.Number()),
  weight_lb: Type.Optional(
    Type.Number({ description: 'Weight in lbs (preferred — operator speaks pounds)' }),
  ),
  weight_kg: Type.Optional(
    Type.Number({ description: 'Legacy kg only; prefer weight_lb' }),
  ),
  duration_min: Type.Optional(
    Type.Number({
      description:
        'Minutes for this exercise. Required on cardio (run, bike, treadmill, etc.) — drives Health UI cardio chart.',
    }),
  ),
  notes: Type.Optional(Type.String()),
  muscle_groups: Type.Optional(
    Type.Array(Type.String(), {
      description: `Optional tags: ${MUSCLE_GROUPS.join(', ')}`,
    }),
  ),
})

function toolError(text: string): { content: ToolContentBlock[] } {
  return { content: [{ type: 'text', text }] }
}

function workoutListSummary(entries: WorkoutLogEntryRow[]): string {
  if (entries.length === 0) return 'Found 0 workouts.'
  const enriched = enrichWorkoutEntries(entries)
  const lines = enriched.map(
    (e) => `${e.logged_datetime_local} [${e.status}] — ${e.title}`,
  )
  return `Found ${entries.length} workouts: ${lines.join('; ')}.`
}

function withDb<T>(fn: (db: ReturnType<typeof openHealthDb>) => T): T | { content: ToolContentBlock[] } {
  let db: ReturnType<typeof openHealthDb> | undefined
  try {
    db = openHealthDb()
    return fn(db)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return toolError(message)
  } finally {
    db?.close()
  }
}

export function registerWorkoutTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'sylo_health_workout_log',
    label: 'Log workout',
    description:
      'Add a workout on any calendar day (use date for past/future days). Use status=planned for scheduled sessions. Lifts: sets/reps/weight_lb per exercise. Cardio: duration_min on each cardio exercise + muscle_groups including cardio. Include muscle_groups on all exercises for weakness analysis.',
    parameters: Type.Object({
      title: Type.String({ description: 'Workout name, e.g. "Upper body", "5k run"' }),
      description: Type.Optional(Type.String()),
      duration_min: Type.Optional(Type.Number({ description: 'Total duration in minutes' })),
      calories_burned: Type.Optional(Type.Number({ description: 'Estimated calories burned' })),
      exercises: Type.Optional(Type.Array(exerciseSchema)),
      notes: Type.Optional(Type.String()),
      status: statusSchema,
      date: Type.Optional(
        Type.String({ description: 'Calendar day for this workout (YYYY-MM-DD). Defaults to today.' }),
      ),
      logged_at: Type.Optional(Type.Number({ description: 'Unix ms; overrides date when set' })),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const { entry, replaced_planned } = insertWorkoutLog(db, {
          title: String(params.title ?? ''),
          description: params.description != null ? String(params.description) : null,
          duration_min: typeof params.duration_min === 'number' ? params.duration_min : null,
          calories_burned:
            typeof params.calories_burned === 'number' ? Math.round(params.calories_burned) : null,
          exercises: (params.exercises as WorkoutExercise[] | undefined) ?? [],
          notes: params.notes != null ? String(params.notes) : null,
          status: params.status as 'completed' | 'planned' | 'skipped' | undefined,
          date: params.date,
          logged_at: params.logged_at,
        })
        const enriched = enrichWorkoutEntry(entry)
        const action = replaced_planned ? 'Workout completed (replaced planned session)' : 'Workout logged'
        return healthToolOk(db, `${action} for ${enriched.logged_datetime_local} [${enriched.status}].`, {
          entry: enriched,
          replaced_planned,
        })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_workout_update',
    label: 'Update workout',
    description:
      'Edit a workout by id. Set status=completed when operator finishes a planned session. Can move day via date. When updating cardio, set duration_min on the cardio exercise row(s), not session metadata alone.',
    parameters: Type.Object({
      id: Type.String(),
      title: Type.Optional(Type.String()),
      description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      duration_min: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
      calories_burned: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
      exercises: Type.Optional(Type.Array(exerciseSchema)),
      notes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      status: statusSchema,
      date: Type.Optional(Type.String()),
      logged_at: Type.Optional(Type.Number()),
    }),
    async execute(_id, params) {
      const id = String(params.id ?? '').trim()
      if (!id) return toolError('sylo_health_workout_update requires id.')
      return withDb((db) => {
        const entry = updateWorkoutLog(db, id, {
          title: params.title != null ? String(params.title) : undefined,
          description: params.description as string | null | undefined,
          duration_min: params.duration_min as number | null | undefined,
          calories_burned: params.calories_burned as number | null | undefined,
          exercises: params.exercises as WorkoutExercise[] | undefined,
          notes: params.notes as string | null | undefined,
          status: params.status as 'completed' | 'planned' | 'skipped' | undefined,
          date: params.date,
          logged_at: params.logged_at,
        })
        if (!entry) return toolError(`No workout with id ${id}.`)
        return healthToolOk(db, 'Workout updated.', { entry: enrichWorkoutEntry(entry) })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_workout_delete',
    label: 'Delete workout',
    description: 'Remove a workout log entry by id.',
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id, params) {
      const id = String(params.id ?? '').trim()
      if (!id) return toolError('sylo_health_workout_delete requires id.')
      return withDb((db) => {
        const deleted = deleteWorkoutLog(db, id)
        if (!deleted) return toolError(`No workout with id ${id}.`)
        return healthToolOk(db, 'Workout deleted.', { id })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_workout_list',
    label: 'List workouts',
    description:
      'List workouts for a day (date) or inclusive range (start_date + end_date). Optional status filter.',
    parameters: Type.Object({
      ...dateRangeSchema,
      status: statusSchema,
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const entries = listWorkoutsForRangeArg(db, {
          date: params.date,
          start_date: params.start_date,
          end_date: params.end_date,
          status: params.status,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
        })
        const enriched = enrichWorkoutEntries(entries)
        return healthToolOk(db, workoutListSummary(entries), { entries: enriched })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_workout_summary',
    label: 'Workout range summary',
    description:
      'Aggregate workouts over a day or date range: counts by status, total minutes, calories, plus entries.',
    parameters: Type.Object({
      ...dateRangeSchema,
      status: statusSchema,
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const summary = buildWorkoutRangeSummary(db, {
          date: params.date,
          start_date: params.start_date,
          end_date: params.end_date,
          status: params.status,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
        })
        const enriched = enrichWorkoutEntries(summary.entries)
        return healthToolOk(
          db,
          `Workouts ${summary.start_date} → ${summary.end_date}: ${summary.workout_count} sessions (${summary.completed_count} completed, ${summary.planned_count} planned, ${summary.skipped_count} skipped).`,
          { summary: { ...summary, entries: enriched } },
        )
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_workout_get',
    label: 'Get workout',
    description: 'Fetch one workout log entry by id.',
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id, params) {
      const id = String(params.id ?? '').trim()
      if (!id) return toolError('sylo_health_workout_get requires id.')
      return withDb((db) => {
        const entry = getWorkoutById(db, id)
        if (!entry) return toolError(`No workout with id ${id}.`)
        return healthToolOk(db, 'Workout loaded.', { entry: enrichWorkoutEntry(entry) })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_exercise_history',
    label: 'Exercise history',
    description:
      'Search past lifts by exercise name (case-insensitive substring). Not limited to 93 days — returns newest matches across all history.',
    parameters: Type.Object({
      name: Type.String({ description: 'Exercise name or substring, e.g. "bench", "squat"' }),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    }),
    async execute(_id, params) {
      const name = String(params.name ?? '').trim()
      if (!name) return toolError('sylo_health_exercise_history requires name.')
      return withDb((db) => {
        const hits = searchExerciseHistory(db, {
          name,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
        })
        if (hits.length === 0) {
          return healthToolOk(db, `No history found for "${name}".`, { hits: [] })
        }
        const lines = hits.map((h) => {
          const ex = h.exercise
          const load =
            ex.weight_lb != null ?
              `${ex.sets ?? '?'}x${ex.reps ?? '?'} @ ${ex.weight_lb} lb`
            : `${ex.sets ?? '?'}x${ex.reps ?? '?'}`
          return `${h.logged_datetime_local} — ${ex.name}: ${load}`
        })
        return healthToolOk(db, `Found ${hits.length} matches for "${name}": ${lines.join('; ')}.`, {
          hits,
        })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_muscle_summary',
    label: 'Muscle group summary',
    description:
      'Per-muscle-group volume over a date range (sessions, sets, reps, est. volume). Use to spot neglected areas.',
    parameters: Type.Object({
      ...dateRangeSchema,
      include_planned: Type.Optional(
        Type.Boolean({ description: 'Include planned (not yet done) sessions in counts' }),
      ),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const summary = buildMuscleSummary(db, {
          date: params.date,
          start_date: params.start_date,
          end_date: params.end_date,
          include_planned: params.include_planned === true,
        })
        const lines = summary.groups.map(
          (g) =>
            `${g.muscle_group}: ${g.session_count} sessions, ${g.set_count} sets, ${g.volume_kg} kg volume`,
        )
        return healthToolOk(
          db,
          `Muscle summary ${summary.start_date} → ${summary.end_date}: ${lines.length ? lines.join('; ') : 'no tagged exercises in range'}.`,
          { summary },
        )
      })
    },
  })
}
