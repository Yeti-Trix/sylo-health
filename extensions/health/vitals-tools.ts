import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

import {
  deleteJournalEntry,
  enrichJournalEntries,
  enrichJournalEntry,
  getJournalById,
  insertJournalEntry,
  listJournalForRangeArg,
  updateJournalEntry,
} from '../../shared/journal-store.js'
import { openHealthDb } from '../../shared/nutrition-store.js'
import type { HealthJournalEntryRow, WeightLogEntryRow } from '../../shared/types.js'
import {
  buildWeightRangeSummary,
  deleteWeightLog,
  enrichWeightEntries,
  enrichWeightEntry,
  getWeightById,
  insertWeightLog,
  listWeightsForRangeArg,
  updateWeightLog,
} from '../../shared/weight-store.js'

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

function weightListSummary(entries: WeightLogEntryRow[]): string {
  if (entries.length === 0) return 'Found 0 weight entries.'
  const enriched = enrichWeightEntries(entries)
  const lines = enriched.map((e) => `${e.logged_datetime_local} — ${e.weight_lb} lb`)
  return `Found ${entries.length} weight entries: ${lines.join('; ')}.`
}

function journalListSummary(entries: HealthJournalEntryRow[]): string {
  if (entries.length === 0) return 'Found 0 journal notes.'
  const enriched = enrichJournalEntries(entries)
  const lines = enriched.map((e) => {
    const tag = e.category ? `[${e.category}] ` : ''
    const preview = e.body.length > 60 ? `${e.body.slice(0, 57)}…` : e.body
    return `${e.logged_datetime_local} — ${tag}${preview}`
  })
  return `Found ${entries.length} journal notes: ${lines.join('; ')}.`
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

export function registerVitalsTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'sylo_health_weight_log',
    label: 'Log weight',
    description:
      'Record a weigh-in on any calendar day (use date for backfills). Pass weight_lb (preferred). Updates profile/calorie targets when this is the latest entry.',
    parameters: Type.Object({
      weight_lb: Type.Optional(Type.Number({ description: 'Body weight in lbs (preferred)' })),
      weight_kg: Type.Optional(Type.Number({ description: 'Legacy kg only' })),
      date: Type.Optional(
        Type.String({ description: 'Calendar day (YYYY-MM-DD). Defaults to today.' }),
      ),
      notes: Type.Optional(Type.String()),
      // Loose string on purpose: strict Literal unions caused whole-call
      // validation rejects on near-miss values; store normalizes instead.
      source: Type.Optional(
        Type.String({
          description: 'One of: operator_manual, scale, agent_estimate. Other values are coerced.',
        }),
      ),
      logged_at: Type.Optional(Type.Number({ description: 'Unix ms; overrides date when set' })),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const entry = insertWeightLog(db, {
          weight_lb: typeof params.weight_lb === 'number' ? params.weight_lb : undefined,
          weight_kg: typeof params.weight_kg === 'number' ? params.weight_kg : undefined,
          date: params.date,
          notes: params.notes != null ? String(params.notes) : null,
          source: params.source != null ? String(params.source) : undefined,
          logged_at: params.logged_at,
        })
        const enriched = enrichWeightEntry(entry)
        return ok(`Weight logged for ${enriched.logged_datetime_local}: ${enriched.weight_lb} lb.`, {
          entry: enriched,
        })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_weight_update',
    label: 'Update weight entry',
    description: 'Edit a weigh-in by id. Can move it to another day via date or logged_at.',
    parameters: Type.Object({
      id: Type.String(),
      weight_lb: Type.Optional(Type.Number()),
      weight_kg: Type.Optional(Type.Number()),
      notes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      source: Type.Optional(Type.String()),
      date: Type.Optional(Type.String()),
      logged_at: Type.Optional(Type.Number()),
    }),
    async execute(_id, params) {
      const id = String(params.id ?? '').trim()
      if (!id) return toolError('sylo_health_weight_update requires id.')
      return withDb((db) => {
        const entry = updateWeightLog(db, id, {
          weight_lb: typeof params.weight_lb === 'number' ? params.weight_lb : undefined,
          weight_kg: typeof params.weight_kg === 'number' ? params.weight_kg : undefined,
          notes: params.notes as string | null | undefined,
          source: params.source != null ? String(params.source) : undefined,
          date: params.date,
          logged_at: params.logged_at,
        })
        if (!entry) return toolError(`No weight entry with id ${id}.`)
        return ok('Weight entry updated.', { entry: enrichWeightEntry(entry) })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_weight_delete',
    label: 'Delete weight entry',
    description: 'Remove a weigh-in by id. Re-syncs profile weight from the remaining latest entry.',
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id, params) {
      const id = String(params.id ?? '').trim()
      if (!id) return toolError('sylo_health_weight_delete requires id.')
      return withDb((db) => {
        const deleted = deleteWeightLog(db, id)
        if (!deleted) return toolError(`No weight entry with id ${id}.`)
        return ok('Weight entry deleted.', { id })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_weight_list',
    label: 'List weight history',
    description:
      'List weigh-ins for a day (date) or inclusive range (start_date + end_date). Defaults to today.',
    parameters: Type.Object({
      ...dateRangeSchema,
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const entries = listWeightsForRangeArg(db, {
          date: params.date,
          start_date: params.start_date,
          end_date: params.end_date,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
        })
        const enriched = enrichWeightEntries(entries)
        return ok(weightListSummary(entries), { entries: enriched })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_weight_summary',
    label: 'Weight range summary',
    description:
      'Weight trend over a day or date range: latest weight, change in range, target weight, plus entries.',
    parameters: Type.Object({
      ...dateRangeSchema,
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const summary = buildWeightRangeSummary(db, {
          date: params.date,
          start_date: params.start_date,
          end_date: params.end_date,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
        })
        const enriched = enrichWeightEntries(summary.entries)
        return ok(
          `Weight ${summary.start_date} → ${summary.end_date}: ${summary.entry_count} entries; latest ${summary.latest_weight_lb ?? '—'} lb.`,
          { summary: { ...summary, entries: enriched } },
        )
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_weight_get',
    label: 'Get weight entry',
    description: 'Fetch one weigh-in by id.',
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id, params) {
      const id = String(params.id ?? '').trim()
      if (!id) return toolError('sylo_health_weight_get requires id.')
      return withDb((db) => {
        const entry = getWeightById(db, id)
        if (!entry) return toolError(`No weight entry with id ${id}.`)
        return ok('Weight entry loaded.', { entry: enrichWeightEntry(entry) })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_journal_add',
    label: 'Add health journal note',
    description:
      'Save a contextual health note (pain, mood, constraints, preferences) for any calendar day. Builds long-term history for coaching.',
    parameters: Type.Object({
      body: Type.String({ description: 'Note text, e.g. "Back has been hurting this week"' }),
      category: Type.Optional(
        Type.String({
          description: 'Optional tag: pain, mood, preference, injury, coach_note, general, etc.',
        }),
      ),
      active: Type.Optional(
        Type.Boolean({
          description:
            'Ongoing constraint for coaching (default true for pain/injury/preference; false for coach_note). Set false when resolved.',
        }),
      ),
      date: Type.Optional(Type.String({ description: 'Calendar day (YYYY-MM-DD). Defaults to today.' })),
      logged_at: Type.Optional(Type.Number()),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const entry = insertJournalEntry(db, {
          body: String(params.body ?? ''),
          category: params.category != null ? String(params.category) : null,
          active: typeof params.active === 'boolean' ? params.active : undefined,
          date: params.date,
          logged_at: params.logged_at,
        })
        return ok('Journal note saved.', { entry: enrichJournalEntry(entry) })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_journal_update',
    label: 'Update journal note',
    description: 'Edit a journal note by id.',
    parameters: Type.Object({
      id: Type.String(),
      body: Type.Optional(Type.String()),
      category: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      active: Type.Optional(
        Type.Boolean({ description: 'Set false when pain/injury/preference is resolved.' }),
      ),
      date: Type.Optional(Type.String()),
      logged_at: Type.Optional(Type.Number()),
    }),
    async execute(_id, params) {
      const id = String(params.id ?? '').trim()
      if (!id) return toolError('sylo_health_journal_update requires id.')
      return withDb((db) => {
        const entry = updateJournalEntry(db, id, {
          body: params.body != null ? String(params.body) : undefined,
          category: params.category as string | null | undefined,
          active: typeof params.active === 'boolean' ? params.active : undefined,
          date: params.date,
          logged_at: params.logged_at,
        })
        if (!entry) return toolError(`No journal note with id ${id}.`)
        return ok('Journal note updated.', { entry: enrichJournalEntry(entry) })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_journal_delete',
    label: 'Delete journal note',
    description: 'Remove a journal note by id.',
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id, params) {
      const id = String(params.id ?? '').trim()
      if (!id) return toolError('sylo_health_journal_delete requires id.')
      return withDb((db) => {
        const deleted = deleteJournalEntry(db, id)
        if (!deleted) return toolError(`No journal note with id ${id}.`)
        return ok('Journal note deleted.', { id })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_journal_list',
    label: 'List journal notes',
    description:
      'List health journal notes for a day (date) or inclusive range (start_date + end_date). Defaults to today. Use active_only=true for current ongoing constraints.',
    parameters: Type.Object({
      ...dateRangeSchema,
      active_only: Type.Optional(
        Type.Boolean({ description: 'When true, return only active ongoing notes (pain, injury, preference).' }),
      ),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const entries = listJournalForRangeArg(db, {
          date: params.date,
          start_date: params.start_date,
          end_date: params.end_date,
          active_only: params.active_only === true,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
        })
        const enriched = enrichJournalEntries(entries)
        return ok(journalListSummary(entries), { entries: enriched })
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_journal_get',
    label: 'Get journal note',
    description: 'Fetch one journal note by id.',
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id, params) {
      const id = String(params.id ?? '').trim()
      if (!id) return toolError('sylo_health_journal_get requires id.')
      return withDb((db) => {
        const entry = getJournalById(db, id)
        if (!entry) return toolError(`No journal note with id ${id}.`)
        return ok('Journal note loaded.', { entry: enrichJournalEntry(entry) })
      })
    },
  })
}
