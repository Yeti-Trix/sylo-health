import { randomUUID } from 'node:crypto'

import { formatLocalLoggedAt } from './date-range.js'
import { type HealthStore } from './health-store.js'
import type { WorkoutPlanDay, WorkoutPlanRow, WorkoutPlanStatus } from './types.js'
import { normalizeExercises } from './workout-store.js'

export function enrichPlan(plan: WorkoutPlanRow): WorkoutPlanRow {
  const local = formatLocalLoggedAt(plan.created_at)
  return {
    ...plan,
    created_date: local.logged_date,
    created_datetime_local: local.logged_datetime_local,
  }
}

export function enrichPlans(plans: WorkoutPlanRow[]): WorkoutPlanRow[] {
  return plans.map(enrichPlan)
}

function normalizePlanStatus(raw: unknown): WorkoutPlanStatus {
  return String(raw) === 'archived' ? 'archived' : 'active'
}

function normalizePlanDays(raw: unknown): WorkoutPlanDay[] {
  if (!Array.isArray(raw)) return []
  return raw.map((d) => {
    const day = d as Partial<WorkoutPlanDay>
    return {
      day: String(day.day ?? '').trim() || 'Day',
      focus: day.focus != null ? String(day.focus).trim() || undefined : undefined,
      exercises: normalizeExercises(Array.isArray(day.exercises) ? day.exercises : []),
      notes: day.notes != null ? String(day.notes).trim() || undefined : undefined,
    }
  })
}

/**
 * Save a new plan version as the single active plan.
 * Any currently active plan is archived in the same operation —
 * revisions are inserts, never in-place edits, so history is preserved.
 */
export function insertWorkoutPlan(
  s: HealthStore,
  args: {
    title: string
    days: WorkoutPlanDay[]
    rationale?: string | null
  },
): WorkoutPlanRow {
  const title = String(args.title ?? '').trim()
  if (!title) throw new Error('title is required.')
  const days = normalizePlanDays(args.days)
  if (days.length === 0) throw new Error('days must contain at least one day.')
  const now = Date.now()
  const id = randomUUID()

  // Archive any currently active plans (preserve history).
  for (const p of s.plans) {
    if (p.status === 'active') {
      p.status = 'archived'
      p.updated_at = now
      s.savePlan(p)
    }
  }

  const plan: WorkoutPlanRow = {
    id,
    created_at: now,
    title,
    days,
    rationale: args.rationale?.trim() || null,
    status: 'active',
    updated_at: now,
  }
  s.plans.push(plan)
  s.savePlan(plan)
  return plan
}

export function getPlanById(s: HealthStore, id: string): WorkoutPlanRow | null {
  return s.plans.find((p) => p.id === id) ?? null
}

export function getActivePlan(s: HealthStore): WorkoutPlanRow | null {
  const active = s.plans
    .filter((p) => p.status === 'active')
    .sort((a, b) => b.created_at - a.created_at)
  return active[0] ?? null
}

export function listWorkoutPlans(
  s: HealthStore,
  opts?: { limit?: number },
): WorkoutPlanRow[] {
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 20))
  return [...s.plans]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit)
}

/** Archive the active plan without replacing it (operator stops following a program). */
export function archiveActivePlan(s: HealthStore): WorkoutPlanRow | null {
  const active = getActivePlan(s)
  if (!active) return null
  active.status = 'archived'
  active.updated_at = Date.now()
  s.savePlan(active)
  return active
}