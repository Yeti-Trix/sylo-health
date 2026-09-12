import { useEffect, useMemo, useState } from 'react'

import { bridge } from '../bridge'
import type { ExerciseHistoryHit, WorkoutExercise, WorkoutSetEntry } from '../types'

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function setWeightLb(s: WorkoutSetEntry): number | null {
  return typeof s.weight_lb === 'number' && s.weight_lb > 0 ? s.weight_lb : null
}

/** Best single-set weight (lb) for one history hit. */
function hitTopWeight(hit: ExerciseHistoryHit): number | null {
  const fromList = (hit.exercise.set_list ?? [])
    .map(setWeightLb)
    .filter((w): w is number => w != null)
  const candidates = [...fromList]
  if (typeof hit.exercise.weight_lb === 'number' && hit.exercise.weight_lb > 0) {
    candidates.push(hit.exercise.weight_lb)
  }
  return candidates.length > 0 ? Math.max(...candidates) : null
}

export type ExerciseHistoryInfo = {
  /** Most recent completed session for this lift, formatted. */
  last: string | null
  /** All-time heaviest single set (lb). */
  prLb: number | null
  /** Past exercise names (for autocomplete). */
  knownNames: string[]
}

export function ExerciseEditor({
  exercise,
  knownNames,
  onChange,
  onRemove,
}: {
  exercise: WorkoutExercise
  knownNames: string[]
  onChange: (next: WorkoutExercise) => void
  onRemove: () => void
}): React.ReactElement {
  const [history, setHistory] = useState<ExerciseHistoryInfo | null>(null)
  const isCardio =
    exercise.duration_min != null &&
    exercise.sets == null &&
    exercise.reps == null &&
    (exercise.set_list == null || exercise.set_list.length === 0)

  useEffect(() => {
    let cancelled = false
    const name = exercise.name.trim()
    if (!name) {
      setHistory(null)
      return
    }
    bridge
      .exerciseHistory({ name, limit: 50 })
      .then((hits) => {
        if (cancelled) return
        const completed = hits.filter((h) => h.workout_status === 'completed')
        const lastHit = completed[0] ?? null
        let last: string | null = null
        if (lastHit) {
          const ex = lastHit.exercise
          const parts: string[] = []
          if (ex.set_list && ex.set_list.length > 0) {
            parts.push(
              ex.set_list
                .map((s) => {
                  const w = setWeightLb(s)
                  return `${s.reps != null ? `${s.reps} reps` : '—'}${w != null ? ` @ ${w} lb` : ''}`
                })
                .join(', '),
            )
          } else {
            if (ex.sets != null && ex.reps != null) parts.push(`${ex.sets}×${ex.reps}`)
            else if (ex.reps != null) parts.push(`${ex.reps} reps`)
            if (ex.weight_lb != null) parts.push(`@ ${ex.weight_lb} lb`)
          }
          last = parts.length > 0 ? `${parts.join(' · ')} (${fmtDate(lastHit.logged_date)})` : null
        }
        const prHits = [...hits, ...completed]
        let prLb: number | null = null
        for (const h of prHits) {
          const w = hitTopWeight(h)
          if (w != null && (prLb == null || w > prLb)) prLb = w
        }
        setHistory({ last, prLb, knownNames: [] })
      })
      .catch(() => {
        if (!cancelled) setHistory({ last: null, prLb: null, knownNames: [] })
      })
    return () => {
      cancelled = true
    }
  }, [exercise.name])

  const sets = useMemo<WorkoutSetEntry[]>(() => exercise.set_list ?? [], [exercise.set_list])

  const patchSet = (idx: number, patch: Partial<WorkoutSetEntry>) => {
    const next = sets.map((s, i) => (i === idx ? { ...s, ...patch } : { ...s }))
    onChange({ ...exercise, set_list: next, sets: next.length })
  }

  const addSet = () => {
    const template = sets[sets.length - 1]
    const next: WorkoutSetEntry = template ? { ...template, done: false } : { done: false, weight_lb: exercise.weight_lb, reps: exercise.reps ?? 8 }
    const nextList = [...sets, next]
    onChange({
      ...exercise,
      set_list: nextList,
      sets: nextList.length,
      weight_lb: exercise.weight_lb ?? next.weight_lb,
      reps: exercise.reps ?? next.reps,
    })
  }

  const removeSet = (idx: number) => {
    const nextList = sets.filter((_, i) => i !== idx)
    onChange({
      ...exercise,
      set_list: nextList,
      sets: nextList.length > 0 ? nextList.length : undefined,
    })
  }

  const toggleSetDone = (idx: number) => {
    patchSet(idx, { done: !sets[idx]?.done })
  }

  const allDone = sets.length > 0 && sets.every((s) => s.done)
  const doneCount = sets.filter((s) => s.done).length

  return (
    <div className={`exercise-card${allDoneSet(exercise) ? ' exercise-card-done' : ''}`}>
      <div className="exercise-head">
        <input
          className="exercise-name"
          value={exercise.name}
          placeholder="Exercise name"
          list="known-exercise-names"
          onChange={(e) => onChange({ ...exercise, name: e.target.value })}
        />
        <button
          type="button"
          className="icon-btn danger"
          aria-label={`Remove ${exercise.name || 'exercise'}`}
          title="Remove exercise"
          onClick={onRemove}
        >
          ×
        </button>
      </div>

      {history?.last || history?.prLb != null ? (
        <div className="exercise-refs">
          {history?.last ? <span className="exercise-last">Last: {history.last}</span> : null}
          {history?.prLb != null ? <span className="exercise-pr">PR: {history.prLb} lb</span> : null}
        </div>
      ) : null}

      {isCardio ? (
        <div className="exercise-cardio">
          <label>
            Duration (min)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={exercise.duration_min ?? ''}
              onChange={(e) =>
                onChange({
                  ...exercise,
                  duration_min: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)),
                })
              }
            />
          </label>
        </div>
      ) : (
        <>
          <table className="set-table">
            <thead>
              <tr>
                <th className="col-done" aria-label="Done" />
                <th className="col-idx">Set</th>
                <th>Weight (lb)</th>
                <th>Reps</th>
                <th className="col-rm" aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {sets.map((s, i) => (
                <tr key={i} className={s.done ? 'set-done' : undefined}>
                  <td className="col-done">
                    <button
                      type="button"
                      className={`set-check${s.done ? ' on' : ''}`}
                      aria-label={s.done ? `Mark set ${i + 1} not done` : `Mark set ${i + 1} done`}
                      aria-pressed={s.done === true}
                      onClick={() => toggleSetDone(i)}
                    >
                      {s.done ? '✓' : ''}
                    </button>
                  </td>
                  <td className="col-idx">{i + 1}</td>
                  <td>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="—"
                      value={s.weight_lb ?? ''}
                      onChange={(e) =>
                        patchSet(i, {
                          weight_lb: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="—"
                      value={s.reps ?? ''}
                      onChange={(e) =>
                        patchSet(i, {
                          reps: e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value))),
                        })
                      }
                    />
                  </td>
                  <td className="col-rm">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove set ${i + 1}`}
                      title="Remove set"
                      onClick={() => removeSet(i)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="set-actions">
            <button type="button" className="btn add-set-btn" onClick={addSet}>
              + Add set
            </button>
            {sets.length > 0 ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => onChange({ ...exercise, set_list: sets.map((s) => ({ ...s, done: !allDoneSet(exercise) })) })}
              >
                {allDoneSet(exercise) ? 'Clear done' : 'All done'}
              </button>
            ) : null}
            {sets.length > 0 ? (
              <span className="set-progress">
                {doneCount}/{sets.length} sets
              </span>
            ) : (
              <span className="set-progress muted">No sets yet</span>
            )}
          </div>
        </>
      )}

      <input
        className="exercise-notes"
        type="text"
        placeholder="Notes for this exercise…"
        value={exercise.notes ?? ''}
        onChange={(e) => onChange({ ...exercise, notes: e.target.value === '' ? undefined : e.target.value })}
      />
    </div>
  )
}

function allDoneSet(ex: WorkoutExercise): boolean {
  const list = ex.set_list ?? []
  return list.length > 0 && list.every((s) => s.done === true)
}