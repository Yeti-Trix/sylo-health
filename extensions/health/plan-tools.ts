import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

import { healthToolOk } from '../../shared/health-tool-response.js'
import { openHealthDb } from '../../shared/nutrition-store.js'
import {
  archiveActivePlan,
  enrichPlan,
  enrichPlans,
  getActivePlan,
  getPlanById,
  insertWorkoutPlan,
  listWorkoutPlans,
} from '../../shared/plan-store.js'
import type { WorkoutPlanDay, WorkoutPlanRow } from '../../shared/types.js'
import { MUSCLE_GROUPS } from '../../shared/workout-constants.js'

type ToolContentBlock = { type: 'text'; text: string }

const planExerciseSchema = Type.Object({
  name: Type.String(),
  sets: Type.Optional(Type.Number()),
  reps: Type.Optional(Type.Number()),
  weight_lb: Type.Optional(
    Type.Number({ description: 'Target weight in lbs (preferred — operator speaks pounds)' }),
  ),
  weight_kg: Type.Optional(Type.Number({ description: 'Legacy kg only; prefer weight_lb' })),
  duration_min: Type.Optional(Type.Number()),
  notes: Type.Optional(Type.String({ description: 'e.g. progression rule "+5 lb when 3x8 clean"' })),
  muscle_groups: Type.Optional(
    Type.Array(Type.String(), { description: `Optional tags: ${MUSCLE_GROUPS.join(', ')}` }),
  ),
})

const planDaySchema = Type.Object({
  day: Type.String({ description: 'Weekday or slot label, e.g. "Monday" or "Day 1"' }),
  focus: Type.Optional(Type.String({ description: 'Session focus, e.g. "Push", "Legs", "Rest"' })),
  exercises: Type.Array(planExerciseSchema),
  notes: Type.Optional(Type.String()),
})

function toolError(text: string): { content: ToolContentBlock[] } {
  return { content: [{ type: 'text', text }] }
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

function planSummaryLine(p: WorkoutPlanRow): string {
  const enriched = enrichPlan(p)
  return `${enriched.created_date} [${p.status}] — ${p.title} (${p.days.length} days)`
}

export function registerPlanTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'sylo_health_plan_set',
    label: 'Set workout plan',
    description:
      'Save a new workout plan version as the active program (weekly template: days, exercises, target sets/reps/weight_lb, progression notes). Automatically archives the previous active plan — full history is kept. Use rationale to explain what changed and why. Do NOT use the journal for plans.',
    parameters: Type.Object({
      title: Type.String({ description: 'Program name, e.g. "PPL 6-day" or "Upper/Lower 4-day"' }),
      days: Type.Array(planDaySchema, { minItems: 1 }),
      rationale: Type.Optional(
        Type.String({
          description: 'Why this plan / what changed from the previous version',
        }),
      ),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        let plan: WorkoutPlanRow
        try {
          plan = insertWorkoutPlan(db, {
            title: String(params.title ?? ''),
            days: params.days as WorkoutPlanDay[],
            rationale: params.rationale != null ? String(params.rationale) : null,
          })
        } catch (e) {
          return toolError(e instanceof Error ? e.message : String(e))
        }
        return healthToolOk(
          db,
          `Workout plan "${plan.title}" saved as active (${plan.days.length} days); previous plan archived.`,
          { plan: enrichPlan(plan) },
        )
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_plan_get',
    label: 'Get active workout plan',
    description:
      'Read the current active workout plan (or a specific version by id). Check this before workout planning, progression advice, or scheduling sessions.',
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: 'Plan version id; omit for the active plan' })),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const id = params.id != null ? String(params.id).trim() : ''
        const plan = id ? getPlanById(db, id) : getActivePlan(db)
        if (!plan) {
          return toolError(
            id ? `No workout plan with id ${id}.` : 'No active workout plan. Propose one and save with sylo_health_plan_set.',
          )
        }
        return healthToolOk(db, `Workout plan loaded: ${planSummaryLine(plan)}.`, {
          plan: enrichPlan(plan),
        })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_plan_list',
    label: 'List workout plan history',
    description:
      'List workout plan versions newest first (active + archived) to see how the program evolved.',
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const plans = listWorkoutPlans(db, {
          limit: typeof params.limit === 'number' ? params.limit : undefined,
        })
        const summary =
          plans.length === 0 ?
            'No workout plans saved yet.'
          : `Found ${plans.length} plan versions: ${plans.map(planSummaryLine).join('; ')}.`
        return healthToolOk(db, summary, { plans: enrichPlans(plans) })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_plan_archive',
    label: 'Archive active workout plan',
    description:
      'Archive the active plan without replacing it (operator stops following a program). History is kept.',
    parameters: Type.Object({}),
    async execute() {
      return withDb((db) => {
        const plan = archiveActivePlan(db)
        if (!plan) return toolError('No active workout plan to archive.')
        return healthToolOk(db, `Workout plan "${plan.title}" archived.`, { plan: enrichPlan(plan) })
      })
    },
  })
}
