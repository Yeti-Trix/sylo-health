import { ExerciseLines } from './ExerciseLines'
import type { WorkoutEntry } from '../types'

function statusLabel(status: WorkoutEntry['status']): string | null {
  if (!status || status === 'completed') return null
  return status
}

export function WorkoutList({ entries }: { entries: WorkoutEntry[] }) {
  if (entries.length === 0) {
    return <p className="empty">No workouts in this range. Log in chat.</p>
  }

  return (
    <div className="entry-list">
      {entries.map((e) => {
        const badge = statusLabel(e.status)
        return (
          <article key={e.id} className="entry-card">
            <h4>
              {e.title}
              {badge && <span className={`workout-badge workout-badge-${badge}`}>{badge}</span>}
            </h4>
            <p className="entry-meta">
              {e.logged_datetime_local ?? '—'}
              {e.duration_min != null ? ` · ${e.duration_min} min` : ''}
              {e.calories_burned != null ? ` · ${e.calories_burned} kcal burned` : ''}
            </p>
            {e.exercises && e.exercises.length > 0 && (
              <ExerciseLines exercises={e.exercises} show1Rm={e.status !== 'planned'} />
            )}
            {e.notes && <p className="entry-notes">{e.notes}</p>}
          </article>
        )
      })}
    </div>
  )
}
