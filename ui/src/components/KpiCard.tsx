export function KpiCard({
  label,
  value,
  accent,
  dualUnits,
}: {
  label: string
  value: string
  accent?: boolean
  /** Slightly smaller type when value shows kg · lb */
  dualUnits?: boolean
}) {
  return (
    <div className="kpi-card">
      <span className="kpi-label">{label}</span>
      <span
        className={`kpi-value${accent ? ' accent' : ''}${dualUnits ? ' dual-units' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}
