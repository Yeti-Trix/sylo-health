import { useEffect, useState } from 'react'

import { bridge } from '../bridge'
import type { WorkoutPlan } from '../types'
import { formatLiftLoad } from '../utils/format-lift'

export function ActivePlanPanel() {
  const [plan, setPlan] = useState<WorkoutPlan | null>(null)
  const [history, setHistory] = useState<WorkoutPlan[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    bridge
      .planActive()
      .then((p) => {
        if (!cancelled) setPlan(p)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleHistory = () => {
    const next = !showHistory
    setShowHistory(next)
    if (next && history.length === 0) {
      bridge
        .planList({ limit: 20 })
        .then(setHistory)
        .catch((e: Error) => setError(e.message))
    }
  }

  if (loading) return null
  if (error) {
    return (
      <section className="panel plan-panel">
        <h3>Training plan</h3>
        <p className="error">{error}</p>
      </section>
    )
  }

  return (
    <section className="panel plan-panel">
      <div className="plan-header">
        <h3>Training plan</h3>
        <button type="button" className="plan-history-btn" onClick={toggleHistory}>
          {showHistory ? 'Hide history' : 'History'}
        </button>
      </div>

      {!plan && (
        <p className="empty">
          No active plan. Ask the agent to build one — it saves versions here as the program evolves.
        </p>
      )}

      {plan && (
        <>
          <p className="plan-title">
            {plan.title}
            <span className="plan-since">since {plan.created_date ?? '—'}</span>
          </p>
          {plan.rationale && <p className="plan-rationale">{plan.rationale}</p>}

          <div className="plan-days">
            {plan.days.map((d, i) => (
              <div key={`${d.day}-${i}`} className="plan-day">
                <p className="plan-day-head">
                  {d.day}
                  {d.focus && <span className="plan-day-focus">{d.focus}</span>}
                </p>
                {d.exercises.length > 0 ?
                  <ul className="plan-day-lifts">
                    {d.exercises.map((ex, j) => (
                      <li key={`${ex.name}-${j}`}>
                        <span className="exercise-name">{ex.name}</span>
                        <span className="exercise-load">{formatLiftLoad(ex)}</span>
                      </li>
                    ))}
                  </ul>
                : <p className="plan-day-rest">rest</p>}
                {d.notes && <p className="plan-day-notes">{d.notes}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {showHistory && (
        <div className="plan-history">
          <h4>Plan versions</h4>
          {history.length === 0 ?
            <p className="empty">No versions yet.</p>
          : <ul className="plan-history-list">
              {history.map((p) => (
                <li key={p.id} className={p.status === 'active' ? 'active' : ''}>
                  <span className="plan-history-date">{p.created_date ?? '—'}</span>
                  <span className="plan-history-title">{p.title}</span>
                  <span className={`workout-badge workout-badge-${p.status}`}>{p.status}</span>
                  {p.rationale && <span className="plan-history-rationale">{p.rationale}</span>}
                </li>
              ))}
            </ul>
          }
        </div>
      )}
    </section>
  )
}
