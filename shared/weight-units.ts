/** US customary ↔ metric for operator (lbs) vs TDEE/UI (kg). */
export const KG_TO_LB = 2.2046226218

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function kgToLb(kg: number): number {
  return round1(kg * KG_TO_LB)
}

export function lbToKg(lb: number): number {
  return round1(lb / KG_TO_LB)
}

export function validateWeightLb(lb: number): string | null {
  if (!Number.isFinite(lb) || lb < 44 || lb > 1100) {
    return 'weight_lb must be between 44 and 1100.'
  }
  return null
}

export function validateWeightKg(kg: number): string | null {
  if (!Number.isFinite(kg) || kg < 20 || kg > 500) {
    return 'weight_kg must be between 20 and 500.'
  }
  return null
}

/** Resolve body weight from operator lbs (preferred) or legacy kg. */
export function resolveBodyWeight(args: {
  weight_lb?: unknown
  weight_kg?: unknown
}): { weight_lb: number; weight_kg: number } {
  const hasLb = typeof args.weight_lb === 'number' && Number.isFinite(args.weight_lb)
  const hasKg = typeof args.weight_kg === 'number' && Number.isFinite(args.weight_kg)
  if (hasLb) {
    const weight_lb = round1(args.weight_lb as number)
    const err = validateWeightLb(weight_lb)
    if (err) throw new Error(err)
    return { weight_lb, weight_kg: lbToKg(weight_lb) }
  }
  if (hasKg) {
    const weight_kg = round1(args.weight_kg as number)
    const err = validateWeightKg(weight_kg)
    if (err) throw new Error(err)
    return { weight_lb: kgToLb(weight_kg), weight_kg }
  }
  throw new Error('weight_lb or weight_kg is required.')
}

/** Profile current + goal weight — lbs preferred; kg derived for TDEE. */
export function resolveProfileWeights(raw: {
  weight_lb?: unknown
  weight_kg?: unknown
  target_weight_lb?: unknown
  target_weight_kg?: unknown
}): {
  weight_lb: number
  weight_kg: number
  target_weight_lb: number
  target_weight_kg: number
} {
  const body = resolveBodyWeight({ weight_lb: raw.weight_lb, weight_kg: raw.weight_kg })
  const target = resolveBodyWeight({
    weight_lb: raw.target_weight_lb,
    weight_kg: raw.target_weight_kg,
  })
  return {
    weight_lb: body.weight_lb,
    weight_kg: body.weight_kg,
    target_weight_lb: target.weight_lb,
    target_weight_kg: target.weight_kg,
  }
}

/** Resolve lift weight — store **lbs** for agent recall; keep kg for volume math. */
export function resolveExerciseWeight(args: {
  weight_lb?: unknown
  weight_kg?: unknown
}): { weight_lb?: number; weight_kg?: number } {
  const hasLb = typeof args.weight_lb === 'number' && Number.isFinite(args.weight_lb)
  const hasKg = typeof args.weight_kg === 'number' && Number.isFinite(args.weight_kg)
  if (!hasLb && !hasKg) return {}
  if (hasLb) {
    const weight_lb = round1(args.weight_lb as number)
    const err = validateWeightLb(weight_lb)
    if (err) throw new Error(err)
    return { weight_lb, weight_kg: lbToKg(weight_lb) }
  }
  const weight_kg = round1(args.weight_kg as number)
  const err = validateWeightKg(weight_kg)
  if (err) throw new Error(err)
  return { weight_lb: kgToLb(weight_kg), weight_kg }
}
