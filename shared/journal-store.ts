import { randomUUID } from 'node:crypto'

import { formatLocalLoggedAt, resolveLoggedAt, resolveRangeBounds } from './date-range.js'
import { monthKeyFromLoggedAt, type HealthStore } from './health-store.js'
import type { HealthJournalEntryRow } from './types.js'

export function enrichJournalEntry(entry: HealthJournalEntryRow): HealthJournalEntryRow {
  const local = formatLocalLoggedAt(entry.logged_at)
  return {
    ...entry,
    logged_date: local.logged_date,
    logged_day_of_week: local.logged_day_of_week,
    logged_time: local.logged_time,
    logged_datetime_local: local.logged_datetime_local,
  }
}

export function enrichJournalEntries(entries: HealthJournalEntryRow[]): HealthJournalEntryRow[] {
  return entries.map(enrichJournalEntry)
}

function defaultJournalActive(category: string | null): boolean {
  return (category ?? '').trim().toLowerCase() !== 'coach_note'
}

export function insertJournalEntry(
  s: HealthStore,
  args: {
    body: string
    category?: string | null
    active?: boolean
    date?: unknown
    logged_at?: unknown
  },
): HealthJournalEntryRow {
  const body = String(args.body ?? '').trim()
  if (!body) throw new Error('body is required.')
  const now = Date.now()
  const id = randomUUID()
  const loggedAt = resolveLoggedAt({ date: args.date, logged_at: args.logged_at })
  const category = args.category != null ? String(args.category).trim() || null : null
  const active = args.active !== undefined ? args.active : defaultJournalActive(category)

  const entry: HealthJournalEntryRow = {
    id,
    logged_at: loggedAt,
    body,
    category,
    active,
    updated_at: now,
  }
  s.journal.push(entry)
  s.appendLog('journal', entry)
  return entry
}

export function getJournalById(s: HealthStore, id: string): HealthJournalEntryRow | null {
  return s.journal.find((e) => e.id === id) ?? null
}

export function updateJournalEntry(
  s: HealthStore,
  id: string,
  patch: {
    body?: string
    category?: string | null
    active?: boolean
    date?: unknown
    logged_at?: unknown
  },
): HealthJournalEntryRow | null {
  const existing = getJournalById(s, id)
  if (!existing) return null
  const oldMonth = monthKeyFromLoggedAt(existing.logged_at)
  const now = Date.now()
  let loggedAt = existing.logged_at
  if (patch.logged_at !== undefined || patch.date !== undefined) {
    loggedAt = resolveLoggedAt({ date: patch.date, logged_at: patch.logged_at })
  }
  const body = patch.body !== undefined ? String(patch.body).trim() : existing.body
  if (!body) throw new Error('body cannot be empty.')
  const category =
    patch.category !== undefined ?
      patch.category ? String(patch.category).trim() : null
    : existing.category
  const active = patch.active !== undefined ? patch.active : existing.active

  const merged: HealthJournalEntryRow = {
    ...existing,
    body,
    category,
    active,
    logged_at: loggedAt,
    updated_at: now,
  }

  const idx = s.journal.findIndex((e) => e.id === id)
  s.journal[idx] = merged

  const newMonth = monthKeyFromLoggedAt(merged.logged_at)
  s.rewriteLogMonth('journal', oldMonth)
  if (newMonth !== oldMonth) s.rewriteLogMonth('journal', newMonth)
  return merged
}

export function deleteJournalEntry(s: HealthStore, id: string): boolean {
  const existing = getJournalById(s, id)
  if (!existing) return false
  const oldMonth = monthKeyFromLoggedAt(existing.logged_at)
  s.journal = s.journal.filter((e) => e.id !== id)
  s.rewriteLogMonth('journal', oldMonth)
  return true
}

export function listJournalEntries(
  s: HealthStore,
  opts?: { from_ms?: number; to_ms?: number; limit?: number; active_only?: boolean },
): HealthJournalEntryRow[] {
  const from = opts?.from_ms ?? 0
  const to = opts?.to_ms ?? Number.MAX_SAFE_INTEGER
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100))
  let rows = s.journal.filter((e) => e.logged_at >= from && e.logged_at <= to)
  if (opts?.active_only === true) rows = rows.filter((e) => e.active)
  return rows.sort((a, b) => b.logged_at - a.logged_at).slice(0, limit)
}

export function listActiveJournalEntries(
  s: HealthStore,
  opts?: { limit?: number },
): HealthJournalEntryRow[] {
  const limit = Math.min(50, Math.max(1, opts?.limit ?? 20))
  return s.journal
    .filter(
      (e) => e.active && (e.category ?? '').trim().toLowerCase() !== 'coach_note',
    )
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, limit)
}

export function listJournalForRangeArg(
  s: HealthStore,
  args?: {
    start_date?: unknown
    end_date?: unknown
    date?: unknown
    limit?: number
    active_only?: boolean
  },
): HealthJournalEntryRow[] {
  const range = resolveRangeBounds(args ?? {})
  return listJournalEntries(s, {
    from_ms: range.start_ms,
    to_ms: range.end_ms,
    limit: args?.limit,
    active_only: args?.active_only,
  })
}