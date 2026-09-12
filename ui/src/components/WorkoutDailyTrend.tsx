import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { DailyWorkoutMetrics } from '../utils/workout-daily-metrics'
import { formatVolumeLb } from '../utils/workout-daily-metrics'

const tooltipStyle = {
  background: '#161a20',
  border: '1px solid #2a3140',
  borderRadius: 6,
  fontSize: 12,
}

function DailyBarChart({
  data,
  dataKey,
  fill,
  yWidth,
  tooltipLabel,
  tooltipFormatter,
}: {
  data: DailyWorkoutMetrics[]
  dataKey: 'volume_lb' | 'cardio_min' | 'set_count'
  fill: string
  yWidth: number
  tooltipLabel: string
  tooltipFormatter: (value: number, row: DailyWorkoutMetrics) => [string, string]
}) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--health-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--health-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--health-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={yWidth}
            tickFormatter={dataKey === 'volume_lb' ? formatVolumeLb : undefined}
          />
          <Tooltip
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as DailyWorkoutMetrics | undefined
              return row?.date ?? ''
            }}
            formatter={(value: number, _name, item) =>
              tooltipFormatter(value, item.payload as DailyWorkoutMetrics)
            }
            contentStyle={tooltipStyle}
          />
          <Bar dataKey={dataKey} name={tooltipLabel} fill={fill} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function WorkoutDailyTrend({ days }: { days: DailyWorkoutMetrics[] }) {
  const liftDays = days.filter((d) => d.volume_lb > 0 || d.set_count > 0)
  const cardioDays = days.filter((d) => d.cardio_min > 0)

  if (liftDays.length === 0 && cardioDays.length === 0) {
    return <p className="empty">No completed workout volume in this range.</p>
  }

  return (
    <>
      {liftDays.length > 0 && (
        <section className="panel" style={{ marginBottom: 14 }}>
          <h3>Volume lifted per day</h3>
          <p className="panel-caption">Sets × reps × weight — training load, not 1RM.</p>
          <DailyBarChart
            data={liftDays}
            dataKey="volume_lb"
            fill="var(--chart-2)"
            yWidth={40}
            tooltipLabel="Volume"
            tooltipFormatter={(value, row) => [
              `${value.toLocaleString('en-US')} lb · ${row.set_count} sets · ${row.exercise_count} exercises`,
              'Volume',
            ]}
          />
        </section>
      )}

      {cardioDays.length > 0 && (
        <section className="panel" style={{ marginBottom: 14 }}>
          <h3>Cardio per day</h3>
          <DailyBarChart
            data={cardioDays}
            dataKey="cardio_min"
            fill="var(--chart-3)"
            yWidth={28}
            tooltipLabel="Cardio"
            tooltipFormatter={(value) => [`${value} min`, 'Cardio']}
          />
        </section>
      )}
    </>
  )
}
