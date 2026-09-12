import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { DailySummary } from '../types'

export function CalorieTrend({
  summaries,
  target,
}: {
  summaries: DailySummary[]
  target: number
}) {
  const chartData = summaries.map((s) => ({
    label: s.date.slice(5),
    calories: s.consumed.calories,
    target,
    full: `${s.day_of_week} ${s.date}`,
  }))

  if (chartData.every((d) => d.calories === 0)) {
    return <p className="empty">No calorie data in this range.</p>
  }

  return (
    <div className="chart-wrap tall">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="calFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--health-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--health-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--health-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.full ? String(payload[0].payload.full) : ''
            }
            formatter={(v: number) => [`${v} kcal`, 'Eaten']}
            contentStyle={{
              background: '#161a20',
              border: '1px solid #2a3140',
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="calories"
            stroke="var(--chart-1)"
            fill="url(#calFill)"
            strokeWidth={2}
            dot={{ r: 2, fill: 'var(--chart-1)' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
