import type { WeightEntry } from '../types'
import { formatWeightDual } from '../utils/weight'

export function WeightList({ entries }: { entries: WeightEntry[] }) {
  if (entries.length === 0) {
    return <p className="empty">No weigh-ins in this range.</p>
  }

  return (
    <div className="entry-list">
      {entries.map((e) => (
        <article key={e.id} className="entry-card">
          <h4>{formatWeightDual(e.weight_kg, e.weight_lb)}</h4>
          <p className="entry-meta">
            {e.logged_day_of_week && e.logged_date ?
              `${e.logged_day_of_week} ${e.logged_date}`
            : (e.logged_date ?? '—')}
            {e.notes ? ` · ${e.notes}` : ''}
          </p>
        </article>
      ))}
    </div>
  )
}
