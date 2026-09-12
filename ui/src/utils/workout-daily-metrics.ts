import type { WorkoutEntry, WorkoutExercise } from '../types'

export type DailyWorkoutMetrics = {
  date: string
  label: string
  volume_lb: number
  set_count: number
  exercise_count: number
  cardio_min: number
}

function exerciseVolumeLb(ex: WorkoutExercise): number {
  if (ex.weight_lb == null || ex.weight_lb <= 0) return 0
  const sets = ex.sets ?? 1
  const reps = ex.reps ?? 0
  if (reps <= 0) return 0
  return sets * reps * ex.weight_lb
}

function exerciseCardioMin(ex: WorkoutExercise): number {
  if (ex.weight_lb != null && ex.weight_lb > 0) return 0
  return ex.duration_min ?? 0
}

function isCompleted(entry: WorkoutEntry): boolean {
  return entry.status !== 'planned' && entry.status !== 'skipped'
}

export function buildDailyWorkoutMetrics(entries: WorkoutEntry[]): DailyWorkoutMetrics[] {
  const byDay = new Map<string, DailyWorkoutMetrics>()

  for (const e of entries) {
    if (!isCompleted(e)) continue
    const day = e.logged_date ?? e.logged_datetime_local?.split(' ')[1]
    if (!day) continue

    let volume_lb = 0
    let set_count = 0
    let exercise_count = 0
    let cardio_min = 0

    for (const ex of e.exercises ?? []) {
      exercise_count += 1
      volume_lb += exerciseVolumeLb(ex)
      if (ex.weight_lb != null && ex.weight_lb > 0) {
        set_count += ex.sets ?? 1
      }
      cardio_min += exerciseCardioMin(ex)
    }

    if (volume_lb === 0 && cardio_min === 0 && e.duration_min != null) {
      cardio_min += e.duration_min
    }

    const cur = byDay.get(day) ?? {
      date: day,
      label: day.slice(5),
      volume_lb: 0,
      set_count: 0,
      exercise_count: 0,
      cardio_min: 0,
    }
    cur.volume_lb += volume_lb
    cur.set_count += set_count
    cur.exercise_count += exercise_count
    cur.cardio_min += cardio_min
    byDay.set(day, cur)
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function sumWorkoutMetrics(days: DailyWorkoutMetrics[]) {
  return days.reduce(
    (acc, d) => ({
      volume_lb: acc.volume_lb + d.volume_lb,
      set_count: acc.set_count + d.set_count,
      cardio_min: acc.cardio_min + d.cardio_min,
    }),
    { volume_lb: 0, set_count: 0, cardio_min: 0 },
  )
}

export function formatVolumeLb(lb: number): string {
  if (lb >= 10_000) return `${(lb / 1000).toFixed(1)}k`
  return lb.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
