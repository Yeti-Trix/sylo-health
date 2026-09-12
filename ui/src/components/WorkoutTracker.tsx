import { useEffect, useRef, useState } from 'react'

import { bridge } from '../bridge'
import { ExerciseEditor } from './ExerciseEditor'
import { WorkoutExercisePicker } from './WorkoutExercisePicker'
import type { WorkoutEntry, WorkoutExercise } from '../types'
import { collectExerciseNames } from '../utils/format-lift'

const SAVE_DEBOUNCE_MS = 700

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

function statusBadgeClass(status?: string): string {
  switch (status) {
    case 'planned':
      return 'workout-badge workout-badge-planned'
    case 'skipped':
      return 'workout-badge workout-badge-skipped'
    default:
      return 'workout-badge'
  }
}

export function WorkoutTracker({
  workout,
  historyNames,
  onChanged,
  onDeleted,
}: {
  /** Latest server state for this workout (refreshed externally). */
  workout: WorkoutEntry
  /** All known exercise names for autocomplete. */
  historyNames: string[]
  /** Called after a successful save (external refresh already happened). */
  onChanged?: (updated: WorkoutEntry) => void
  /** Called after the workout is deleted. */
  onDeleted?: () => void
}): React.ReactElement {
  const [draft, setDraft] = useState<WorkoutEntry>(workout)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync from server only when the workout itself changes and we have no pending edits.
  useEffect(() => {
    if (dirtyRef.current) return
    setDraft(workout)
    setSaveState('idle')
    setError(null)
  }, [workout])

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    },
    [],
  )

  const persist = (next: WorkoutEntry) => {
    dirtyRef.current = true
    setDraft(next)
    setSaveState('dirty')
    setError(null)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      setSaveState('saving')
      bridge
        .workoutUpdate(next.id, {
          title: next.title,
          notes: next.notes ?? null,
          duration_min: next.duration_min ?? null,
          calories_burned: next.calories_burned ?? null,
          status: next.status ?? 'planned',
          exercises: next.exercises ?? [],
        })
        .then(() => {
          dirtyRef.current = false
          setSaveState('saved')
          onChanged?.(next)
        })
        .catch((e: Error) => {
          dirtyRef.current = false
          setSaveState('error')
          setError(e.message)
        })
    }, SAVE_DEBOUNCE_MS)
  }

  const patchExercises = (exercises: WorkoutExercise[]) => {
    persist({ ...draft, exercises })
  }

  const setStatus = (status: 'planned' | 'completed' | 'skipped') => {
    persist({ ...draft, status })
  }

  const deleteWorkout = () => {
    bridge
      .workoutDelete(draft.id)
      .then(() => onDeleted?.())
      .catch((e: Error) => setError(e.message))
  }

  const allDone =
    (draft.exercises ?? []).length > 0 &&
    (draft.exercises ?? []).every(
      (ex) => ex.duration_min != null || (ex.set_list ?? []).every((s) => s.done === true),
    )

  return (
    <div className="workout-tracker">
      <div className="tracker-head">
        <input
          className="tracker-title"
          value={draft.title}
          placeholder="Workout title"
          onChange={(e) => persist({ ...draft, title: e.target.value })}
        />
        <span className={statusBadgeClass(draft.status)}>{draft.status ?? 'planned'}</span>
      </div>
      {draft.logged_date ? <p className="tracker-date">{draft.logged_date}</p> : null}

      <div className="tracker-status-actions">
        {draft.status !== 'completed' ? (
          <button type="button" className="btn primary" onClick={() => setStatus('completed')}>
            ✓ Complete workout
          </button>
        ) : (
          <button type="button" className="btn ghost" onClick={() => setStatus('planned')}>
            Reopen (mark planned)
          </button>
        )}
        {draft.status !== 'skipped' ? (
          <button type="button" className="btn ghost" onClick={() => setStatus('skipped')}>
            Skip
          </button>
        ) : (
          <button type="button" className="btn ghost" onClick={() => setStatus('planned')}>
            Unskip
          </button>
        )}
        {!confirmDelete ? (
          <button type="button" className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        ) : (
          <button type="button" className="btn danger" onClick={() => void deleteWorkout()}>
            Confirm delete?
          </button>
        )}
      </div>

      {saveState === 'saving' ? <p className="save-hint">Saving…</p> : null}
      {saveState === 'saved' ? <p className="save-hint ok">Saved ✓</p> : null}
      {saveState === 'dirty' ? <p className="save-hint">Unsaved changes…</p> : null}
      {error ? <p className="save-hint err">{error}</p> : null}

      {allDone && draft.status === 'planned' ? (
        <button type="button" className="btn primary finish-btn" onClick={() => setStatus('completed')}>
          All sets done — finish workout ✓
        </button>
      ) : null}

      <div className="exercise-list">
        {(draft.exercises ?? []).map((ex, i) => (
          <ExerciseEditor
            key={i}
            exercise={ex}
            knownNames={historyNames}
            onChange={(next) => {
              const exercises = [...(draft.exercises ?? [])]
              exercises[i] = next
              patchExercises(exercises)
            }}
            onRemove={() => {
              const exercises = (draft.exercises ?? []).filter((_, j) => j !== i)
              patchExercises(exercises)
            }}
          />
        ))}
      </div>

      <button type="button" className="btn add-exercise-btn" onClick={() => setPickerOpen(true)}>
        + Add exercise
      </button>

      <label className="tracker-notes-label">
        Workout notes
        <textarea
          className="tracker-notes"
          rows={2}
          placeholder="How did it go?"
          value={draft.notes ?? ''}
          onChange={(e) => persist({ ...draft, notes: e.target.value === '' ? null : e.target.value })}
        />
      </label>

      <datalist id="known-exercise-names">
        {collectExerciseNames(draft.exercises ? [draft] : [])
          .concat(historyNames)
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((n) => (
            <option key={n} value={n} />
          ))}
      </datalist>

      {pickerOpen ? (
        <WorkoutExercisePicker
          knownNames={historyNames}
          onAdd={(ex) => patchExercises([...(draft.exercises ?? []), ex])}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  )
}