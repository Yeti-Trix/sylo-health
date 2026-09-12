import { useCallback, useEffect, useState } from 'react'

import { bridge } from '../bridge'
import type { ExerciseHistoryHit } from '../types'
import { formatLiftLoad } from '../utils/format-lift'
import {
  estimate1RmFromExercise,
  maxEstimated1RmFromHits,
} from '../utils/one-rep-max'

const HISTORY_LIMIT = 100

export function LiftSearch({ suggestedNames }: { suggestedNames: string[] }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState('')
  const [hits, setHits] = useState<ExerciseHistoryHit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const search = useCallback((name: string) => {
    const term = name.trim()
    if (!term) {
      setHits([])
      setActive('')
      return
    }
    setActive(term)
    setLoading(true)
    setError(null)
    bridge
      .exerciseHistory({ name: term, limit: HISTORY_LIMIT })
      .then((list) => setHits(list))
      .catch((e: Error) => {
        setError(e.message)
        setHits([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim().length >= 2) search(query)
      else if (!query.trim()) {
        setHits([])
        setActive('')
      }
    }, 280)
    return () => clearTimeout(t)
  }, [query, search])

  const lastHit = hits[0]
  const last1Rm = lastHit ? estimate1RmFromExercise(lastHit.exercise) : null
  const best1Rm = maxEstimated1RmFromHits(hits)

  const chips = suggestedNames.slice(0, 12)

  return (
    <section className="panel lift-search">
      <h3>Lift history</h3>
      <p className="panel-caption">Search by name — all-time history, not just this range.</p>

      <div className="lift-search-row">
        <input
          type="search"
          className="lift-search-input"
          placeholder="e.g. bench, squat, row"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search(query)
          }}
          aria-label="Search lifts"
        />
        <button type="button" className="lift-search-btn" onClick={() => search(query)}>
          Search
        </button>
      </div>

      {chips.length > 0 && (
        <div className="lift-chips" role="list">
          {chips.map((name) => (
            <button
              key={name}
              type="button"
              className={`lift-chip${active.toLowerCase() === name.toLowerCase() ? ' active' : ''}`}
              onClick={() => {
                setQuery(name)
                search(name)
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="loading">Searching…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && active && hits.length === 0 && !error && (
        <p className="empty">No history for “{active}”. Log sets in chat.</p>
      )}

      {hits.length > 0 && (
        <>
          <div className="kpi-row lift-1rm-row">
            <div className="kpi-card">
              <span className="kpi-label">Last session est. 1RM</span>
              <span className="kpi-value dual-units">
                {last1Rm != null ? `${last1Rm} lb` : '—'}
              </span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Best est. 1RM (up to {HISTORY_LIMIT} hits)</span>
              <span className="kpi-value dual-units accent">
                {best1Rm != null ? `${best1Rm} lb` : '—'}
              </span>
            </div>
          </div>
          <p className="panel-caption">1RM = Epley estimate from sets×reps×weight — not a tested max.</p>

          <ul className="lift-history-list">
            {hits.map((h, i) => {
              const est = estimate1RmFromExercise(h.exercise)
              return (
                <li key={`${h.workout_id}-${i}`} className="lift-history-item">
                  <div className="lift-history-main">
                    <span className="lift-history-when">
                      {h.logged_day_of_week && h.logged_date ?
                        `${h.logged_day_of_week} ${h.logged_date}`
                      : (h.logged_datetime_local ?? '—')}
                    </span>
                    <span className="lift-history-load">{formatLiftLoad(h.exercise)}</span>
                  </div>
                  <span className="lift-history-meta">
                    {h.workout_title}
                    {est != null ? ` · est. 1RM ${est} lb` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
