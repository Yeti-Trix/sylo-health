import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { WeightEntry } from '../types'
import { formatWeightDual, round1 } from '../utils/weight'

export function WeightTrend({
  entries,
  targetKg,
  targetLb,
}: {
  entries: WeightEntry[]
  targetKg: number | null
  targetLb?: number | null
}) {
  const chartData = [...entries]
    .sort((a, b) => (a.logged_date ?? '').localeCompare(b.logged_date ?? ''))
    .map((e) => ({
      label: e.logged_date?.slice(5) ?? '—',
      weight: e.weight_kg,
      weightLb: e.weight_lb,
      full: e.logged_day_of_week && e.logged_date ? `${e.logged_day_of_week} ${e.logged_date}` : e.logged_date,
    }))

  if (chartData.length === 0) {
    return <p className="empty">No weigh-ins in this range. Tell the agent your weight in chat.</p>
  }

  return (
    <div className="chart-wrap tall">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--health-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--health-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: 'var(--health-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(v: number) => `${round1(v)}`}
          />
          <Tooltip
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.full ? String(payload[0].payload.full) : ''
            }
            formatter={(v: number, _name, item) => [
              formatWeightDual(v, item?.payload?.weightLb),
              'Weight',
            ]}
            contentStyle={{
              background: '#161a20',
              border: '1px solid #2a3140',
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          {targetKg != null && (
            <ReferenceLine
              y={targetKg}
              stroke="var(--health-success)"
              strokeDasharray="4 4"
              label={{
                value: `Goal ${formatWeightDual(targetKg, targetLb)}`,
                fill: 'var(--health-muted)',
                fontSize: 10,
                position: 'insideTopRight',
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="weight"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--chart-2)' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
