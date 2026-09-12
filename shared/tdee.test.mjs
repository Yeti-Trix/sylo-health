/**
 * Run: node --test packages/sylo-health/shared/tdee.test.mjs
 * (from repo root after building tdee to js, or use dynamic import of .ts via esbuild — keep simple with inline expectations)
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bmrKcal, computeMacroTargets } from './tdee.ts'

test('bmr male sample', () => {
  const bmr = bmrKcal('male', 80, 180, 35)
  assert.ok(bmr > 1600 && bmr < 2100)
})

test('computeMacroTargets applies deficit toward lower target weight', () => {
  const heavy = computeMacroTargets({
    height_cm: 180,
    weight_kg: 90,
    age_years: 35,
    sex: 'male',
    activity_level: 'moderate',
    target_weight_kg: 80,
  })
  const atTarget = computeMacroTargets({
    height_cm: 180,
    weight_kg: 80,
    age_years: 35,
    sex: 'male',
    activity_level: 'moderate',
    target_weight_kg: 80,
  })
  assert.ok(heavy.daily_calorie_target < atTarget.daily_calorie_target)
  assert.equal(heavy.protein_g_target + heavy.carbs_g_target + heavy.fat_g_target > 0, true)
})
