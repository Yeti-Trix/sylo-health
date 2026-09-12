import { useEffect, useState } from 'react'

import { bridge } from '../bridge'
import { KpiCard } from '../components/KpiCard'
import { ActivePlanPanel } from '../components/ActivePlanPanel'
import { LiftSearch } from '../components/LiftSearch'
import { WorkoutDailyTrend } from '../components/WorkoutDailyTrend'
import { WorkoutList } from '../components/WorkoutList'
import type { WorkoutEntry, WorkoutSummary } from '../types'
import { collectExerciseNames } from '../utils/format-lift'
import { rangePayload, type RangePreset } from '../utils/range'
import { buildDailyWorkoutMetrics, formatVolumeLb, sumWorkoutMetrics } from '../utils/workout-daily-metrics'

export function WorkoutsTab({ range }: { range: RangePreset }) {
  const [summary, setSummary] = useState<WorkoutSummary | null>(null)
  const [entries, setEntries] = useState<WorkoutEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const args = rangePayload(range)

    Promise.all([bridge.workoutSummary(args), bridge.workoutList(args)])
      .then(([sum, list]) => {
        if (cancelled) return
        setSummary(sum)
        setEntries(list)
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
  }, [range])

  if (loading) return <p className="loading">Loading workouts…</p>
  if (error) return <p className="error">{error}</p>

  const dailyMetrics = buildDailyWorkoutMetrics(entries)
  const totals = sumWorkoutMetrics(dailyMetrics)

  return (
    <>
      <div className="kpi-row">
        <KpiCard label="Training days" value={String(dailyMetrics.length)} />
        <KpiCard label="Total volume" value={`${formatVolumeLb(totals.volume_lb)} lb`} />
        <KpiCard label="Sets" value={String(totals.set_count)} />
        <KpiCard label="Cardio min" value={String(totals.cardio_min)} />
        <KpiCard label="Planned" value={String(summary?.planned_count ?? 0)} />
        <KpiCard
          label="Calories burned"
          value={String(summary?.total_calories_burned ?? 0)}
          accent
        />
      </div>

      <WorkoutDailyTrend days={dailyMetrics} />

      <ActivePlanPanel />

      <LiftSearch suggestedNames={collectExerciseNames(entries)} />

      <section className="panel">
        <h3>Workouts</h3>
        <WorkoutList entries={entries} />
      </section>
    </>
  )
}
