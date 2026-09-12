import type { JournalEntry } from '../types'

export function JournalList({ entries }: { entries: JournalEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="empty">
        No notes in this range. Tell the agent context (pain, preferences, schedule) to save here.
      </p>
    )
  }

  return (
    <div className="entry-list">
      {entries.map((e) => (
        <article key={e.id} className="entry-card journal-card">
          {e.active && <span className="journal-tag journal-tag-active">active</span>}
          {e.category && <span className="journal-tag">{e.category}</span>}
          <p className="journal-body">{e.body}</p>
          <p className="entry-meta">
            {e.logged_day_of_week && e.logged_date ?
              `${e.logged_day_of_week} ${e.logged_date}`
            : (e.logged_date ?? '—')}
          </p>
        </article>
      ))}
    </div>
  )
}
