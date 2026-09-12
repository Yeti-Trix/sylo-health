import type { WorkoutExercise } from '../types'

export function formatLiftLoad(ex: WorkoutExercise): string {
  const parts: string[] = []
  if (ex.sets != null && ex.reps != null) parts.push(`${ex.sets}×${ex.reps}`)
  else if (ex.reps != null) parts.push(`${ex.reps} reps`)
  else if (ex.sets != null) parts.push(`${ex.sets} sets`)

  if (ex.weight_lb != null) {
    parts.push(`@ ${ex.weight_lb} lb`)
  } else if (ex.duration_min != null) {
    parts.push(`${ex.duration_min} min`)
  }

  return parts.length > 0 ? parts.join(' ') : '—'
}

export function collectExerciseNames(
  entries: { exercises?: WorkoutExercise[] }[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of entries) {
    for (const ex of e.exercises ?? []) {
      const name = ex.name?.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(name)
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}
