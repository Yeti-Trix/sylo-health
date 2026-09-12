import type { MealEntry } from '../types'

function mealWhen(e: MealEntry, showTime: boolean): string | null {
  if (!showTime) return null
  if (e.logged_datetime_local) return e.logged_datetime_local
  if (e.logged_day_of_week && e.logged_date) return `${e.logged_day_of_week} ${e.logged_date}`
  if (e.logged_date) return e.logged_date
  return null
}

export function MealList({ entries, showTime = true }: { entries: MealEntry[]; showTime?: boolean }) {
  if (entries.length === 0) {
    return <p className="empty">No meals logged in this range. Log in chat.</p>
  }

  return (
    <div className="entry-list">
      {entries.map((e) => (
        <article key={e.id} className="entry-card">
          <h4>{e.description}</h4>
          <p className="entry-meta">
            {(() => {
              const when = mealWhen(e, showTime)
              return when ? `${when} · ` : ''
            })()}
            {e.calories} kcal · P{Math.round(e.protein_g)} C{Math.round(e.carbs_g)} F
            {Math.round(e.fat_g)}
          </p>
        </article>
      ))}
    </div>
  )
}
