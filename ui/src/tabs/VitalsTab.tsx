import { useEffect, useState } from 'react'

import { bridge } from '../bridge'
import { JournalList } from '../components/JournalList'
import { KpiCard } from '../components/KpiCard'
import { WeightList } from '../components/WeightList'
import { WeightTrend } from '../components/WeightTrend'
import type { HealthProfile, JournalEntry, WeightEntry, WeightSummary } from '../types'
import { rangePayload, type RangePreset } from '../utils/range'
import { formatDeltaToGoal, formatWeightChangeDual, formatWeightDual } from '../utils/weight'

export function VitalsTab({ range }: { range: RangePreset }) {
  const [profile, setProfile] = useState<HealthProfile | null>(null)
  const [summary, setSummary] = useState<WeightSummary | null>(null)
  const [weights, setWeights] = useState<WeightEntry[]>([])
  const [journal, setJournal] = useState<JournalEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const args = rangePayload(range)

    Promise.all([
      bridge.profileGet(),
      bridge.weightSummary(args),
      bridge.weightList(args),
      bridge.journalList({ ...args, limit: 50 }),
    ])
      .then(([p, sum, list, notes]) => {
        if (cancelled) return
        setProfile(p)
        setSummary(sum)
        setWeights(list)
        setJournal(notes)
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

  if (loading) return <p className="loading">Loading vitals…</p>
  if (error) return <p className="error">{error}</p>

  const latestKg = summary?.latest_weight_kg ?? profile?.weight_kg ?? null
  const latestLb = summary?.latest_weight_lb ?? profile?.weight_lb ?? null
  const targetKg = summary?.target_weight_kg ?? profile?.target_weight_kg ?? null
  const targetLb = summary?.target_weight_lb ?? profile?.target_weight_lb ?? null
  const change =
    summary && summary.entry_count >= 2 ?
      formatWeightChangeDual(summary.change_kg, summary.change_lb)
    : '—'

  return (
    <>
      <p className="vitals-hint">Log weight and health notes in chat — the agent saves history for any day.</p>

      <div className="kpi-row">
        <KpiCard
          label="Current"
          value={latestKg != null ? formatWeightDual(latestKg, latestLb) : '—'}
          dualUnits
        />
        <KpiCard
          label="Goal"
          value={targetKg != null ? formatWeightDual(targetKg, targetLb) : '—'}
          dualUnits
        />
        <KpiCard
          label="To goal"
          value={formatDeltaToGoal(latestKg, targetKg, latestLb, targetLb)}
          accent
          dualUnits
        />
        <KpiCard label="Change (range)" value={change} dualUnits />
      </div>

      <div className="bento">
        <section className="panel">
          <h3>Weight trend</h3>
          <p className="panel-caption">Chart in kg · tooltips show lb · kg</p>
          <WeightTrend entries={weights} targetKg={targetKg} targetLb={targetLb} />
        </section>
      </div>

      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>Weigh-ins</h3>
        <WeightList entries={weights} />
      </section>

      <section className="panel">
        <h3>Health notes</h3>
        <JournalList entries={journal} />
      </section>

      <p className="vitals-footnote">
        Heart rate and steps — planned via Health Connect sync (Garmin, Renpho scale).
      </p>
    </>
  )
}
