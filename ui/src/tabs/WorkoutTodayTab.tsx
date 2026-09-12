import { useCallback, useEffect, useMemo, useState } from 'react'

import { bridge } from '../bridge'
import { WorkoutTracker } from '../components/WorkoutTracker'
import type { WorkoutEntry, WorkoutPlan } from '../types'
import { collectExerciseNames } from '../utils/format-lift'
import { todayYmd } from '../utils/range'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function todayWeekdayName(): string {
  return WEEKDAYS[new Date().getDay()]
}

export function WorkoutTodayTab(): React.ReactElement {
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([])
  const [plan, setPlan] = useState<WorkoutPlan | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [list, activePlan] = await Promise.all([
        bridge.workoutList({ date: todayYmd(), limit: 20 }),
        bridge.planActive(),
      ])
      setWorkouts(list)
      setPlan(activePlan)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void load().finally(() => setLoading(false))
  }, [load])

  // Pick the workout to show: the selected one, else the planned one, else the most recent.
  const selected = useMemo(() => {
    if (workouts.length === 0) return null
    if (selectedId) {
      const found = workouts.find((w) => w.id === selectedId)
      if (found) return found
    }
    return workouts.find((w) => (w.status ?? 'completed') === 'planned') ?? workouts[0]
  }, [workouts, selectedId])

  const planDayForToday = useMemo(() => {
    if (!plan) return null
    const dayName = todayWeekdayName()
    return plan.days.find((d) => d.day.toLowerCase() === dayName.toLowerCase()) ?? null
  }, [plan])

  const startFromPlan = () => {
    if (!planDayForToday || busy) return
    setBusy(true)
    bridge
      .workoutLog({
        title: planDayForToday.focus ? `${planDayForToday.day} — ${planDayForToday.focus}` : planDayForToday.day,
        status: 'planned',
        date: todayYmd(),
        exercises: planDayForToday.exercises.map((ex) => ({
          ...ex,
          set_list:
            ex.sets != null && ex.sets > 0
              ? Array.from({ length: ex.sets }, () => ({
                  done: false,
                  weight_lb: ex.weight_lb,
                  reps: ex.reps,
                }))
              : [{ done: false, weight_lb: ex.weight_lb, reps: ex.reps }],
        })),
        notes: planDayForToday.notes || undefined,
      })
      .then((res) => {
        if (res.entry) setSelectedId(res.entry.id)
        return load()
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const newWorkout = () => {
    if (busy) return
    setBusy(true)
    bridge
      .workoutLog({
        title: 'Workout',
        status: 'planned',
        date: todayYmd(),
        exercises: [{ name: '', set_list: [{ done: false }] }],
      })
      .then((res) => {
        if (res.entry) setSelectedId(res.entry.id)
        return load()
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }

  if (loading) return <p className="loading">Loading today's workout…</p>

  if (error) {
    return (
      <p className="error">
        {error}
        <button type="button" className="btn ghost" onClick={() => void load()}>
          Retry
        </button>
      </p>
    )
  }

  if (!selected) {
    return (
      <div className="today-empty">
        <p className="today-empty-title">No workout for today yet.</p>
        <div className="today-empty-actions">
          {planDayForToday ? (
            <button type="button" className="btn primary" disabled={busy} onClick={startFromPlan}>
              Start from plan — {planDayForToday.focus ?? planDayForToday.day}
            </button>
          ) : null}
          <button type="button" className="btn" disabled={busy} onClick={newWorkout}>
            New workout
          </button>
        </div>
      </div>
    )
  }

  const historyNames = collectExerciseNames(workouts)

  return (
    <div className="today-view">
      {workouts.length > 1 ? (
        <div className="today-workout-tabs" role="tablist" aria-label="Today's workouts">
          {workouts.map((w) => (
            <button
              key={w.id}
              type="button"
              role="tab"
              className={w.id === selected.id ? 'active' : ''}
              aria-selected={w.id === selected.id}
              onClick={() => setSelectedId(w.id)}
            >
              {w.title || 'Workout'}
            </button>
          ))}
        </div>
      ) : null}

      <WorkoutTracker
        key={selected.id}
        workout={selected}
        historyNames={historyNames}
        onChanged={() => void load()}
        onDeleted={() => {
          setSelectedId(null)
          void load()
        }}
      />
    </div>
  )
}