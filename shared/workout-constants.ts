export const WORKOUT_STATUSES = ['completed', 'planned', 'skipped'] as const
export type WorkoutStatus = (typeof WORKOUT_STATUSES)[number]

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'core',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'cardio',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

const MUSCLE_SET = new Set<string>(MUSCLE_GROUPS)

export function normalizeMuscleGroups(raw: unknown): MuscleGroup[] {
  if (!Array.isArray(raw)) return []
  const out: MuscleGroup[] = []
  for (const item of raw) {
    const g = String(item ?? '')
      .trim()
      .toLowerCase()
    if (MUSCLE_SET.has(g) && !out.includes(g as MuscleGroup)) {
      out.push(g as MuscleGroup)
    }
  }
  return out
}

export function normalizeWorkoutStatus(raw: unknown, fallback: WorkoutStatus = 'completed'): WorkoutStatus {
  const s = String(raw ?? fallback).trim().toLowerCase()
  if (s === 'planned' || s === 'skipped' || s === 'completed') return s
  return fallback
}
