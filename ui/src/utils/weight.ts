const KG_TO_LB = 2.2046226218

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function kgToLb(kg: number): number {
  return round1(kg * KG_TO_LB)
}

export function lbToKg(lb: number): number {
  return round1(lb / KG_TO_LB)
}

/** Lbs-first dual display; pass stored lb when available. */
export function formatWeightDual(kg: number, lb?: number | null): string {
  const displayLb = lb != null ? round1(lb) : kgToLb(kg)
  return `${displayLb} lb · ${round1(kg)} kg`
}

export function formatWeightChangeDual(kgDelta: number, lbDelta?: number | null): string {
  const sign = kgDelta > 0 ? '+' : kgDelta < 0 ? '−' : ''
  const kg = round1(Math.abs(kgDelta))
  const lb = lbDelta != null ? round1(Math.abs(lbDelta)) : kgToLb(Math.abs(kgDelta))
  if (kgDelta === 0) return '0 lb · 0 kg'
  return `${sign}${lb} lb · ${sign}${kg} kg`
}

export function formatDeltaToGoal(
  kg: number | null,
  targetKg: number | null,
  lb?: number | null,
  targetLb?: number | null,
): string {
  if (kg == null || targetKg == null) return '—'
  const dKg = round1(kg - targetKg)
  if (dKg === 0) return 'At goal'
  const dLb =
    lb != null && targetLb != null ? round1(lb - targetLb) : kgToLb(Math.abs(dKg)) * (dKg < 0 ? -1 : 1)
  const absLb = round1(Math.abs(dLb))
  if (dKg > 0) return `${absLb} lb (${round1(Math.abs(dKg))} kg) to lose`
  return `${absLb} lb (${round1(Math.abs(dKg))} kg) to gain`
}
