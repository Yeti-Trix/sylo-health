import type { HealthActivityLevel, HealthProfileRow, HealthSex } from './types.js'

const ACTIVITY_MULTIPLIERS: Record<HealthActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

const KCAL_PER_KG_FAT = 7700
const DEFAULT_WEEKLY_KG_LOSS = 0.5
const MAX_DAILY_DEFICIT = 1000
const MIN_DAILY_CALORIES = 1200

export type ProfileInput = {
  height_cm: number
  weight_lb: number
  weight_kg: number
  age_years: number
  sex: HealthSex
  activity_level: HealthActivityLevel
  works_out?: boolean
  target_weight_lb: number
  target_weight_kg: number
  target_weeks?: number | null
}

export type MacroTargets = {
  daily_calorie_target: number
  protein_g_target: number
  carbs_g_target: number
  fat_g_target: number
}

/** Mifflin–St Jeor BMR (kcal/day). */
export function bmrKcal(sex: HealthSex, weightKg: number, heightCm: number, ageYears: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears
  if (sex === 'male') return base + 5
  if (sex === 'female') return base - 161
  return base - 78
}

function maintenanceKcal(profile: ProfileInput): number {
  const mult = ACTIVITY_MULTIPLIERS[profile.activity_level] ?? ACTIVITY_MULTIPLIERS.moderate
  return bmrKcal(profile.sex, profile.weight_kg, profile.height_cm, profile.age_years) * mult
}

function dailyDeficitKcal(profile: ProfileInput): number {
  const deltaKg = profile.weight_kg - profile.target_weight_kg
  if (deltaKg <= 0) return 0

  let deficit: number
  if (profile.target_weeks != null && profile.target_weeks > 0) {
    const totalKcal = deltaKg * KCAL_PER_KG_FAT
    deficit = totalKcal / (profile.target_weeks * 7)
  } else {
    deficit = (DEFAULT_WEEKLY_KG_LOSS * KCAL_PER_KG_FAT) / 7
  }
  return Math.min(MAX_DAILY_DEFICIT, Math.max(0, deficit))
}

/** Daily calorie + macro targets (30% P / 40% C / 30% F). */
export function computeMacroTargets(profile: ProfileInput): MacroTargets {
  const maintenance = maintenanceKcal(profile)
  const deficit = dailyDeficitKcal(profile)
  const daily = Math.max(MIN_DAILY_CALORIES, Math.round(maintenance - deficit))
  return {
    daily_calorie_target: daily,
    protein_g_target: Math.round((daily * 0.3) / 4),
    carbs_g_target: Math.round((daily * 0.4) / 4),
    fat_g_target: Math.round((daily * 0.3) / 9),
  }
}

export function profileTargetsFromRow(row: HealthProfileRow): MacroTargets {
  return {
    daily_calorie_target: row.daily_calorie_target,
    protein_g_target: row.protein_g_target,
    carbs_g_target: row.carbs_g_target,
    fat_g_target: row.fat_g_target,
  }
}
