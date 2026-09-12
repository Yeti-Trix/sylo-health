import type { ExerciseHistoryHit, WorkoutExercise } from '../types'

/** Epley formula — rough estimate, best for 1–10 reps. */
export function estimate1RmLb(weightLb: number, reps: number): number | null {
  if (!Number.isFinite(weightLb) || weightLb <= 0) return null
  if (!Number.isFinite(reps) || reps < 1) return null
  if (reps === 1) return Math.round(weightLb)
  return Math.round(weightLb * (1 + reps / 30))
}

export function estimate1RmFromExercise(ex: WorkoutExercise): number | null {
  if (ex.weight_lb == null || ex.reps == null) return null
  return estimate1RmLb(ex.weight_lb, ex.reps)
}

export function maxEstimated1RmFromHits(hits: ExerciseHistoryHit[]): number | null {
  let best: number | null = null
  for (const h of hits) {
    const est = estimate1RmFromExercise(h.exercise)
    if (est != null && (best == null || est > best)) best = est
  }
  return best
}
