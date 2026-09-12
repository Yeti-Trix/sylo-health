import { useMemo, useState } from 'react'

import { RangePicker } from './components/RangePicker'
import { NutritionTab } from './tabs/NutritionTab'
import { VitalsTab } from './tabs/VitalsTab'
import { WorkoutTodayTab } from './tabs/WorkoutTodayTab'
import { WorkoutsTab } from './tabs/WorkoutsTab'
import { rangeLabel, type RangePreset } from './utils/range'

type MainTab = 'nutrition' | 'workouts' | 'vitals'

const TABS: { id: MainTab; label: string }[] = [
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'workouts', label: 'Workouts' },
  { id: 'vitals', label: 'Vitals' },
]

/**
 * When embedded in the companion, the footer tab is passed via ?tab= and the
 * internal tab bar is hidden (the companion footer provides navigation).
 * Standalone (desktop skill route, no param) keeps the full tab bar.
 */
function initialTabFromUrl(): { tab: MainTab; locked: boolean } {
  try {
    const raw = new URLSearchParams(window.location.search).get('tab')
    if (raw === 'nutrition' || raw === 'vitals') return { tab: raw, locked: true }
    if (raw === 'workout' || raw === 'workouts') return { tab: 'workouts', locked: true }
  } catch {
    /* ignore */
  }
  return { tab: 'nutrition', locked: false }
}

export function App() {
  const [range, setRange] = useState<RangePreset>('today')
  const initial = useMemo(initialTabFromUrl, [])
  const [tab, setTab] = useState<MainTab>(initial.tab)
  const [workoutSub, setWorkoutSub] = useState<'today' | 'overview'>('today')
  const lockedToTab = initial.locked

  return (
    <div className="health-app">
      <header className="health-header">
        <div>
          <h1 className="health-title">Health</h1>
          <p className="health-sub">{rangeLabel(range)} · log meals, workouts, weight, and notes in chat</p>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </header>

      {!lockedToTab && (
        <nav className="tab-bar" role="tablist" aria-label="Health sections" style={{ marginBottom: 14 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={tab === t.id ? 'active' : ''}
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {tab === 'workouts' ? (
        <nav className="tab-bar workout-subtabs" role="tablist" aria-label="Workout views" style={{ marginBottom: 14 }}>
          <button
            type="button"
            role="tab"
            className={workoutSub === 'today' ? 'active' : ''}
            aria-selected={workoutSub === 'today'}
            onClick={() => setWorkoutSub('today')}
          >
            Today
          </button>
          <button
            type="button"
            role="tab"
            className={workoutSub === 'overview' ? 'active' : ''}
            aria-selected={workoutSub === 'overview'}
            onClick={() => setWorkoutSub('overview')}
          >
            Overview
          </button>
        </nav>
      ) : null}

      {tab === 'nutrition' && <NutritionTab range={range} />}
      {tab === 'workouts' && workoutSub === 'today' && <WorkoutTodayTab />}
      {tab === 'workouts' && workoutSub === 'overview' && <WorkoutsTab range={range} />}
      {tab === 'vitals' && <VitalsTab range={range} />}
    </div>
  )
}
