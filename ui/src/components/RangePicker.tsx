import type { RangePreset } from '../utils/range'

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
]

export function RangePicker({
  value,
  onChange,
}: {
  value: RangePreset
  onChange: (v: RangePreset) => void
}) {
  return (
    <div className="segmented" role="tablist" aria-label="Date range">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          className={value === p.id ? 'active' : ''}
          aria-selected={value === p.id}
          onClick={() => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
