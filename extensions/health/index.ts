/**
 * sylo-health — nutrition persistence tools (profile, meal log, summaries).
 *
 * @see features_tracker/active/2026-06-05_14-00-00_sylo_health_nutrition_package.md
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

// Loose strings on purpose: parseProfileInput() coerces to canonical values,
// and strict Literal unions made Pi reject the whole call on near-misses.
const SexSchema = Type.String({
  description: 'One of: male, female, other. Other values are coerced to "other".',
})
const ActivitySchema = Type.String({
  description:
    'One of: sedentary, light, moderate, active, very_active. Unrecognized values are coerced to "moderate".',
})
// Loose string on purpose: strict Literal unions made Pi reject the whole call
// when the model sent near-misses like "operator" or "operator-estimate"
// (26 of 34 health tool errors in the 2026-07-11 trajectory baseline).
// normalizeSource() coerces to the canonical MealLogSource values.
const MealSourceSchema = Type.String({
  description: "One of: operator_text, operator_photo, agent_estimate. Other values are coerced.",
})

import { resolveLoggedAt } from '../../shared/date-range.js'
import {
  buildDailySummariesForRangeArg,
  buildDailySummaryForDateArg,
  deleteMealLog,
  enrichMealLogEntries,
  enrichMealLogEntry,
  getHealthProfile,
  insertMealLog,
  listMealLogsForRangeArg,
  openHealthDb,
  parseProfileInput,
  setHealthProfile,
  updateMealLog,
  validateProfileInput,
  validateProfileParams,
} from '../../shared/nutrition-store.js'
import type { MealLogEntryRow } from '../../shared/types.js'
import type { MealLogItem, MealLogSource } from '../../shared/types.js'
import { registerGarminTools } from './garmin-tools.js'
import { registerPlanTools } from './plan-tools.js'
import { registerVitalsTools } from './vitals-tools.js'
import { registerWorkoutTools } from './workout-tools.js'

const dateRangeParams = {
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

type ToolContentBlock = { type: 'text'; text: string }

const mealItemSchema = Type.Object({
  name: Type.String(),
  serving: Type.Optional(Type.String()),
  calories: Type.Number(),
  protein_g: Type.Number(),
  carbs_g: Type.Number(),
  fat_g: Type.Number(),
})

function toolError(text: string): { content: ToolContentBlock[] } {
  return { content: [{ type: 'text', text }] }
}

function ok(summary: string, data: unknown): { content: ToolContentBlock[] } {
  return {
    content: [
      { type: 'text', text: summary },
      { type: 'text', text: JSON.stringify(data, null, 2) },
    ],
  }
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

function normalizeSource(raw: unknown): MealLogSource {
  const s = String(raw ?? 'agent_estimate').trim().toLowerCase()
  if (s === 'operator_text' || s === 'operator_photo' || s === 'agent_estimate') return s
  if (s.includes('photo') || s.includes('image') || s.includes('picture')) return 'operator_photo'
  if (s.includes('operator') || s.includes('user') || s.includes('text')) return 'operator_text'
  return 'agent_estimate'
}

function normalizeItems(raw: unknown): MealLogItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  return raw as MealLogItem[]
}

function mealListSummary(entries: MealLogEntryRow[]): string {
  if (entries.length === 0) return 'Found 0 meal log entries.'
  const enriched = enrichMealLogEntries(entries)
  const lines = enriched.map((e) => `${e.logged_datetime_local} — ${e.description}`)
  return `Found ${entries.length} meal log entries: ${lines.join('; ')}.`
}

export default function syloHealthExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'sylo_health_profile_get',
    label: 'Health profile get',
    description: 'Read operator health profile and daily calorie/macro targets.',
    parameters: Type.Object({}),
    async execute() {
      return withDb((db) => {
        const profile = getHealthProfile(db)
        if (!profile) {
          return toolError('No health profile yet. Call sylo_health_profile_set first.')
        }
        return ok('Health profile loaded.', { profile })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_profile_set',
    label: 'Health profile set',
    description:
      'Set or update height (cm), weight (lbs preferred), age, sex, activity level, goal weight, optional target_weeks. Recalculates daily calorie and macro targets.',
    parameters: Type.Object({
      height_cm: Type.Number({ description: 'Height in centimeters' }),
      weight_lb: Type.Optional(Type.Number({ description: 'Current weight in pounds (preferred)' })),
      weight_kg: Type.Optional(Type.Number({ description: 'Legacy kg only' })),
      age_years: Type.Number({ description: 'Age in years' }),
      sex: SexSchema,
      activity_level: ActivitySchema,
      works_out: Type.Optional(Type.Boolean({ description: 'Whether operator works out regularly' })),
      target_weight_lb: Type.Optional(Type.Number({ description: 'Goal weight in pounds (preferred)' })),
      target_weight_kg: Type.Optional(Type.Number({ description: 'Legacy goal kg only' })),
      target_weeks: Type.Optional(
        Type.Number({ description: 'Optional weeks to reach target; omit for ~0.5 kg/week pace' }),
      ),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const raw = params as Record<string, unknown>
        const paramErr = validateProfileParams(raw)
        if (paramErr) return toolError(paramErr)
        let input
        try {
          input = parseProfileInput(raw)
        } catch (e) {
          return toolError(e instanceof Error ? e.message : String(e))
        }
        const err = validateProfileInput(input)
        if (err) return toolError(err)
        const profile = setHealthProfile(db, input)
        return ok('Health profile saved; daily targets recalculated.', { profile })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_log_meal',
    label: 'Log meal',
    description:
      'Save a confirmed meal log entry with decomposed items and macro totals. Call only after operator confirmation.',
    parameters: Type.Object({
      description: Type.String({ description: 'Short summary of what was eaten' }),
      items: Type.Array(mealItemSchema, { minItems: 1 }),
      source: Type.Optional(MealSourceSchema),
      date: Type.Optional(
        Type.String({ description: 'Calendar day for this meal (YYYY-MM-DD). Any day, not only today.' }),
      ),
      logged_at: Type.Optional(
        Type.Number({ description: 'Unix ms timestamp; overrides date when set' }),
      ),
      notes: Type.Optional(Type.String()),
      calories: Type.Optional(Type.Number()),
      protein_g: Type.Optional(Type.Number()),
      carbs_g: Type.Optional(Type.Number()),
      fat_g: Type.Optional(Type.Number()),
    }),
    async execute(_id, params) {
      const items = normalizeItems(params.items)
      if (!items) return toolError('sylo_health_log_meal requires at least one item.')
      return withDb((db) => {
        if (!getHealthProfile(db)) {
          return toolError('No health profile. Call sylo_health_profile_set before logging meals.')
        }
        const entry = insertMealLog(db, {
          description: String(params.description ?? ''),
          items,
          source: normalizeSource(params.source),
          logged_at: resolveLoggedAt({ date: params.date, logged_at: params.logged_at }),
          notes: params.notes != null ? String(params.notes) : null,
          calories: typeof params.calories === 'number' ? params.calories : undefined,
          protein_g: typeof params.protein_g === 'number' ? params.protein_g : undefined,
          carbs_g: typeof params.carbs_g === 'number' ? params.carbs_g : undefined,
          fat_g: typeof params.fat_g === 'number' ? params.fat_g : undefined,
        })
        const enriched = enrichMealLogEntry(entry)
        return ok(`Meal logged for ${enriched.logged_datetime_local}.`, { entry: enriched })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_log_update',
    label: 'Update meal log',
    description: 'Edit an existing meal log entry by id.',
    parameters: Type.Object({
      id: Type.String(),
      description: Type.Optional(Type.String()),
      items: Type.Optional(Type.Array(mealItemSchema, { minItems: 1 })),
      source: Type.Optional(MealSourceSchema),
      date: Type.Optional(Type.String({ description: 'Move entry to another calendar day' })),
      logged_at: Type.Optional(Type.Number()),
      notes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      calories: Type.Optional(Type.Number()),
      protein_g: Type.Optional(Type.Number()),
      carbs_g: Type.Optional(Type.Number()),
      fat_g: Type.Optional(Type.Number()),
    }),
    async execute(_id, params) {
      const id = String(params.id ?? '').trim()
      if (!id) return toolError('sylo_health_log_update requires id.')
      return withDb((db) => {
        const entry = updateMealLog(db, id, {
          description: params.description != null ? String(params.description) : undefined,
          items: params.items != null ? (params.items as MealLogItem[]) : undefined,
          source: params.source != null ? normalizeSource(params.source) : undefined,
          logged_at:
            params.logged_at !== undefined || params.date !== undefined ?
              resolveLoggedAt({ date: params.date, logged_at: params.logged_at })
            : undefined,
          notes: params.notes !== undefined ? (params.notes as string | null) : undefined,
          calories: typeof params.calories === 'number' ? params.calories : undefined,
          protein_g: typeof params.protein_g === 'number' ? params.protein_g : undefined,
          carbs_g: typeof params.carbs_g === 'number' ? params.carbs_g : undefined,
          fat_g: typeof params.fat_g === 'number' ? params.fat_g : undefined,
        })
        if (!entry) return toolError(`No meal log entry with id ${id}.`)
        return ok('Meal log updated.', { entry: enrichMealLogEntry(entry) })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_log_delete',
    label: 'Delete meal log',
    description: 'Remove a meal log entry by id.',
    parameters: Type.Object({
      id: Type.String(),
    }),
    async execute(_id, params) {
      const id = String(params.id ?? '').trim()
      if (!id) return toolError('sylo_health_log_delete requires id.')
      return withDb((db) => {
        const deleted = deleteMealLog(db, id)
        if (!deleted) return toolError(`No meal log entry with id ${id}.`)
        return ok('Meal log deleted.', { id })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_log_list',
    label: 'List meal logs',
    description:
      'List meals for a day (date) or inclusive range (start_date + end_date). Defaults to today.',
    parameters: Type.Object({
      ...dateRangeParams,
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const entries = listMealLogsForRangeArg(db, {
          date: params.date,
          start_date: params.start_date,
          end_date: params.end_date,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
        })
        const enriched = enrichMealLogEntries(entries)
        return ok(mealListSummary(entries), { entries: enriched })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_daily_summaries',
    label: 'Nutrition summaries (date range)',
    description:
      'Per-day calorie/macro summaries for each day in a range (start_date + end_date) or single date. Max 93 days.',
    parameters: Type.Object({ ...dateRangeParams }),
    async execute(_id, params) {
      return withDb((db) => {
        if (!getHealthProfile(db)) {
          return toolError('No health profile. Call sylo_health_profile_set first.')
        }
        const summaries = buildDailySummariesForRangeArg(db, {
          date: params.date,
          start_date: params.start_date,
          end_date: params.end_date,
        })
        return ok(`Nutrition summaries: ${summaries.length} day(s).`, { summaries })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_daily_summary',
    label: 'Daily nutrition summary',
    description: 'Calories and macros consumed vs daily targets for one local calendar day.',
    parameters: Type.Object({
      date: Type.Optional(Type.String({ description: 'ISO date or datetime; defaults to today' })),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const summary = buildDailySummaryForDateArg(db, params.date)
        if (!summary) {
          return toolError('No health profile. Call sylo_health_profile_set first.')
        }
        return ok(`Daily summary for ${summary.date}.`, { summary })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_remaining_macros',
    label: 'Remaining macros today',
    description: 'What the operator can still eat today — remaining calories and macros vs targets.',
    parameters: Type.Object({
      date: Type.Optional(Type.String({ description: 'ISO date or datetime; defaults to today' })),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const summary = buildDailySummaryForDateArg(db, params.date)
        if (!summary) {
          return toolError('No health profile. Call sylo_health_profile_set first.')
        }
        return ok(`Remaining macros for ${summary.date}.`, {
          date: summary.date,
          remaining: summary.remaining,
          targets: summary.targets,
          consumed: summary.consumed,
        })
      })
    },
  })

    registerWorkoutTools(pi)
  registerVitalsTools(pi)
  registerPlanTools(pi)
  registerGarminTools(pi)
}
