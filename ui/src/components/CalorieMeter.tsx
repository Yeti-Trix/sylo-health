export function CalorieMeter({
  eaten,
  target,
  remaining,
}: {
  eaten: number
  target: number
  remaining: number
}) {
  const pct = target > 0 ? Math.min(100, Math.round((eaten / target) * 100)) : 0
  const over = eaten > target

  return (
    <div className="calorie-meter">
      <div className="calorie-meter-labels">
        <span>
          {eaten} / {target} kcal
        </span>
        <span className={over ? 'calorie-meter-over' : 'calorie-meter-remaining'}>
          {over ? `${eaten - target} over` : `${remaining} left`}
        </span>
      </div>
      <div className="calorie-meter-track" role="meter" aria-valuenow={eaten} aria-valuemin={0} aria-valuemax={target}>
        <div
          className={`calorie-meter-fill${over ? ' over' : ''}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
        {over && target > 0 ?
          <div className="calorie-meter-fill over" style={{ width: '100%', opacity: 0.35 }} />
        : null}
      </div>
      <p className="calorie-meter-hint">
        {pct}% of daily target
        {over ? ' — over budget' : ''}
      </p>
    </div>
  )
}
