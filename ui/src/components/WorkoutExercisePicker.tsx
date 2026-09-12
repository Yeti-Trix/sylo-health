import { useMemo, useRef, useState } from 'react'

import type { WorkoutExercise } from '../types'

/** Search + add an exercise: type a name, optionally pick from history autocomplete. */
export function WorkoutExercisePicker({
  knownNames,
  onAdd,
  onClose,
}: {
  knownNames: string[]
  onAdd: (exercise: WorkoutExercise) => void
  onClose: () => void
}): React.ReactElement {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return knownNames.slice(0, 8)
    return knownNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 8)
  }, [query, knownNames])

  const add = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd({ name: trimmed, set_list: [{ done: false }], sets: 1 })
    onClose()
  }

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker-card" onClick={(e) => e.stopPropagation()}>
        <h3>Add exercise</h3>
        <input
          ref={inputRef}
          autoFocus
          className="picker-input"
          type="text"
          placeholder="Exercise name — e.g. Bench press"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add(query)
            if (e.key === 'Escape') onClose()
          }}
        />
        {matches.length > 0 ? (
          <div className="picker-suggestions">
            {matches.map((n) => (
              <button key={n} type="button" className="picker-suggestion" onClick={() => add(n)}>
                {n}
              </button>
            ))}
          </div>
        ) : null}
        <div className="picker-actions">
          <button type="button" className="btn" onClick={() => add(query)} disabled={!query.trim()}>
            Add
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}