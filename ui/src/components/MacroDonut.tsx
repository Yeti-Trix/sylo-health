import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import type { MacroTotals } from '../types'

const COLORS = ['var(--health-protein)', 'var(--health-carbs)', 'var(--health-fat)']

export function MacroDonut({
  consumed,
  fill = false,
}: {
  consumed: MacroTotals
  /** Grow to fill the bento panel (Today view). */
  fill?: boolean
}) {
  const data = [
    { name: 'Protein', value: consumed.protein_g },
    { name: 'Carbs', value: consumed.carbs_g },
    { name: 'Fat', value: consumed.fat_g },
  ].filter((d) => d.value > 0)

  if (data.length === 0) {
    return <p className="empty">No macros logged yet.</p>
  }

  const innerRadius = fill ? '58%' : 52
  const outerRadius = fill ? '88%' : 78

  return (
    <div className={fill ? 'macro-donut macro-donut-fill' : 'macro-donut'}>
      <div className={fill ? 'chart-wrap macro-fill' : 'chart-wrap'}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number, name: string) => [`${Math.round(v)}g`, name]}
              contentStyle={{
                background: '#161a20',
                border: '1px solid #2a3140',
                borderRadius: 6,
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="macro-legend">
        <span className="p">P {Math.round(consumed.protein_g)}g</span>
        <span className="c">C {Math.round(consumed.carbs_g)}g</span>
        <span className="f">F {Math.round(consumed.fat_g)}g</span>
      </div>
    </div>
  )
}
