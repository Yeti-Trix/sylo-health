import { useEffect, useState } from 'react'

import { bridge } from '../bridge'
import { CalorieMeter } from '../components/CalorieMeter'
import { CalorieTrend } from '../components/CalorieTrend'
import { KpiCard } from '../components/KpiCard'
import { MacroDonut } from '../components/MacroDonut'
import { MealList } from '../components/MealList'
import type { DailySummary, HealthProfile, MealEntry } from '../types'
import { daysAgo, rangePayload, type RangePreset } from '../utils/range'

export function NutritionTab({ range }: { range: RangePreset }) {
  const [profile, setProfile] = useState<HealthProfile | null>(null)
  const [summaries, setSummaries] = useState<DailySummary[]>([])
  const [weekSummaries, setWeekSummaries] = useState<DailySummary[]>([])
  const [today, setToday] = useState<DailySummary | null>(null)
  const [meals, setMeals] = useState<MealEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const args = rangePayload(range)
    const end = args.date ?? args.end_date
    const weekArgs =
      range === 'today' && end ?
        { start_date: daysAgo(6), end_date: end }
      : null

    Promise.all([
      bridge.profileGet(),
      range === 'today' ?
        bridge.dailySummary(args.date)
      : bridge.dailySummaries(args).then((list) => list),
      bridge.logList(args),
      weekArgs ? bridge.dailySummaries(weekArgs) : Promise.resolve([] as DailySummary[]),
    ])
      .then(([p, sum, list, week]) => {
        if (cancelled) return
        setProfile(p)
        if (range === 'today') {
          setToday(sum as DailySummary | null)
          setSummaries(sum ? [sum as DailySummary] : [])
          setWeekSummaries(week)
        } else {
          setToday(null)
          setSummaries(sum as DailySummary[])
          setWeekSummaries([])
        }
        setMeals(list)
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

  if (loading) return <p className="loading">Loading nutrition…</p>
  if (error) return <p className="error">{error}</p>
  if (!profile) {
    return (
      <p className="empty">
        No health profile yet. Tell the agent your height, weight (lbs), age, activity, and goal weight.
      </p>
    )
  }

  const aggregate = summaries.reduce(
    (acc, s) => ({
      calories: acc.calories + s.consumed.calories,
      protein_g: acc.protein_g + s.consumed.protein_g,
      carbs_g: acc.carbs_g + s.consumed.carbs_g,
      fat_g: acc.fat_g + s.consumed.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  )

  const display =
    range === 'today' && today ?
      {
        eaten: today.consumed.calories,
        target: today.targets.calories,
        remaining: today.remaining.calories,
        macros: today.consumed,
      }
    : {
        eaten: Math.round(aggregate.calories),
        target: profile.daily_calorie_target * summaries.length,
        remaining: Math.max(
          0,
          profile.daily_calorie_target * summaries.length - aggregate.calories,
        ),
        macros: aggregate,
      }

  return (
    <>
      <div className="kpi-row">
        <KpiCard label="Eaten" value={`${display.eaten} kcal`} />
        <KpiCard
          label={range === 'today' ? 'Target' : 'Target (range)'}
          value={`${display.target} kcal`}
        />
        <KpiCard label="Remaining" value={`${display.remaining} kcal`} accent />
      </div>

      <div className="bento">
        <section className={`panel${range === 'today' ? ' panel-macro' : ''}`}>
          <h3>Macros</h3>
          <MacroDonut consumed={display.macros} fill={range === 'today'} />
        </section>
        <section className="panel">
          {range === 'today' ?
            <>
              <h3>Today&apos;s budget</h3>
              <CalorieMeter
                eaten={display.eaten}
                target={display.target}
                remaining={display.remaining}
              />
              <h3 className="panel-subhead">This week</h3>
              <CalorieTrend
                summaries={weekSummaries}
                target={profile.daily_calorie_target}
              />
            </>
          : <>
              <h3>Calories</h3>
              <CalorieTrend summaries={summaries} target={profile.daily_calorie_target} />
            </>
          }
        </section>
      </div>

      <section className="panel">
        <h3>Meals</h3>
        <MealList entries={meals} showTime={range !== 'today'} />
      </section>
    </>
  )
}
