/**
 * One-time migration: operator.sqlite → sylo-user/health/ JSON files.
 *
 * Usage (from the sylo-health package or repo root):
 *   SYLO_HEALTH_DB_PATH=/path/to/sylo-user/.sylo/operator.sqlite \
 *   SYLO_HEALTH_DIR=/path/to/sylo-user/health \
 *   node scripts/migrate-health-db-to-json.mjs
 *
 * Or pass both as CLI args:
 *   node scripts/migrate-health-db-to-json.mjs <dbPath> <healthDir>
 *
 * Idempotent-ish: it overwrites profile.json + plans/, and APPENDS log rows to
 * month files. Run on a fresh healthDir (or after deleting the log subdirs) to
 * avoid duplicates. Prints a before/after row-count report.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { HealthStore, monthKeyFromLoggedAt } from '../shared/health-store.ts'

const dbPath = process.argv[2] || process.env.SYLO_HEALTH_DB_PATH || process.env.SYLO_DB_PATH
if (!dbPath || !existsSync(dbPath)) {
  console.error('No operator.sqlite found. Pass the DB path as the first arg or set SYLO_HEALTH_DB_PATH.')
  process.exit(1)
}

let healthDir = process.argv[3] || process.env.SYLO_HEALTH_DIR
if (!healthDir) {
  // derive: sylo-user/.sylo/operator.sqlite → sylo-user/health
  healthDir = join(dirname(dirname(dbPath)), 'health')
}
mkdirSync(healthDir, { recursive: true })

const db = new DatabaseSync(dbPath, { readOnly: true })

function all(sql, ...params) {
  return db.prepare(sql).all(...params)
}

function get(sql, ...params) {
  return db.prepare(sql).get(...params)
}

function num(x) {
  return x == null ? null : Number(x)
}

const KG_TO_LB = 2.2046226218
function round1(n) {
  return Math.round(n * 10) / 10
}
function kgToLb(kg) {
  return round1(kg * KG_TO_LB)
}
function parseJson(raw, fallback) {
  if (raw == null) return fallback
  try {
    return JSON.parse(String(raw))
  } catch {
    return fallback
  }
}

// ---- profile ----
const profileRow = get('SELECT * FROM health_profile WHERE id = ?', 'default')
  ?? get('SELECT * FROM health_profile LIMIT 1')
  ?? null
let profile = null
if (profileRow) {
  const r = profileRow
  const weight_kg = Number(r.weight_kg)
  const target_weight_kg = Number(r.target_weight_kg)
  profile = {
    id: String(r.id),
    height_cm: Number(r.height_cm),
    weight_lb: r.weight_lb != null && r.weight_lb !== '' ? round1(Number(r.weight_lb)) : kgToLb(weight_kg),
    weight_kg,
    age_years: Number(r.age_years),
    sex: String(r.sex),
    activity_level: String(r.activity_level),
    works_out: Number(r.works_out),
    target_weight_lb:
      r.target_weight_lb != null && r.target_weight_lb !== '' ?
        round1(Number(r.target_weight_lb))
      : kgToLb(target_weight_kg),
    target_weight_kg: target_weight_kg,
    target_weeks: r.target_weeks != null ? Number(r.target_weeks) : null,
    daily_calorie_target: Number(r.daily_calorie_target),
    protein_g_target: Number(r.protein_g_target),
    carbs_g_target: Number(r.carbs_g_target),
    fat_g_target: Number(r.fat_g_target),
    updated_at: Number(r.updated_at),
  }
}

// ---- meals ----
const meals = all('SELECT * FROM meal_log_entries').map((r) => ({
  id: String(r.id),
  logged_at: Number(r.logged_at),
  description: String(r.description),
  items: parseJson(r.items_json, []),
  calories: Number(r.calories),
  protein_g: Number(r.protein_g),
  carbs_g: Number(r.carbs_g),
  fat_g: Number(r.fat_g),
  source: String(r.source),
  notes: r.notes != null ? String(r.notes) : null,
  updated_at: Number(r.updated_at),
}))

// ---- workouts ----
const workouts = all('SELECT * FROM workout_log_entries').map((r) => ({
  id: String(r.id),
  logged_at: Number(r.logged_at),
  title: String(r.title),
  description: r.description != null ? String(r.description) : null,
  duration_min: r.duration_min != null ? Number(r.duration_min) : null,
  calories_burned: r.calories_burned != null ? Number(r.calories_burned) : null,
  exercises: parseJson(r.exercises_json, []),
  notes: r.notes != null ? String(r.notes) : null,
  status: String(r.status ?? 'completed'),
  updated_at: Number(r.updated_at),
}))

// ---- weights ----
const weights = all('SELECT * FROM weight_log_entries').map((r) => {
  const weight_kg = Number(r.weight_kg)
  return {
    id: String(r.id),
    logged_at: Number(r.logged_at),
    weight_lb: r.weight_lb != null && r.weight_lb !== '' ? round1(Number(r.weight_lb)) : kgToLb(weight_kg),
    weight_kg,
    source: String(r.source ?? 'operator_manual'),
    notes: r.notes != null ? String(r.notes) : null,
    updated_at: Number(r.updated_at),
  }
})

// ---- journal ----
const journal = all('SELECT * FROM health_journal_entries').map((r) => ({
  id: String(r.id),
  logged_at: Number(r.logged_at),
  body: String(r.body),
  category: r.category != null ? String(r.category) : null,
  active: !(r.active === 0 || r.active === false || r.active === '0'),
  updated_at: Number(r.updated_at),
}))

// ---- plans ----
const plans = all('SELECT * FROM workout_plans').map((r) => ({
  id: String(r.id),
  created_at: Number(r.created_at),
  title: String(r.title),
  days: parseJson(r.plan_json, []),
  rationale: r.rationale != null ? String(r.rationale) : null,
  status: String(r.status) === 'archived' ? 'archived' : 'active',
  updated_at: Number(r.updated_at),
}))

db.close()

// ---- write to JSON via HealthStore ----
// Load existing JSON first so the migration is idempotent: skip entries whose
// id is already present (safe to re-run to capture new DB writes without dupes).
const store = new HealthStore(healthDir)
const seenMeals = new Set(store.meals.map((e) => e.id))
const seenWorkouts = new Set(store.workouts.map((e) => e.id))
const seenWeights = new Set(store.weights.map((e) => e.id))
const seenJournal = new Set(store.journal.map((e) => e.id))
const seenPlans = new Set(store.plans.map((p) => p.id))

store.profile = profile
if (profile) store.saveProfile()

store.meals = meals
store.workouts = workouts
store.weights = weights
store.journal = journal
store.plans = plans

let newMeals = 0, newWorkouts = 0, newWeights = 0, newJournal = 0, newPlans = 0
for (const m of meals) if (!seenMeals.has(m.id)) { store.appendLog('meals', m); newMeals++ }
for (const w of workouts) if (!seenWorkouts.has(w.id)) { store.appendLog('workouts', w); newWorkouts++ }
for (const w of weights) if (!seenWeights.has(w.id)) { store.appendLog('weights', w); newWeights++ }
for (const j of journal) if (!seenJournal.has(j.id)) { store.appendLog('journal', j); newJournal++ }
for (const p of plans) if (!seenPlans.has(p.id)) { store.savePlan(p); newPlans++ }

console.log('Migration complete →', healthDir)
console.log('  profile :', profile ? 1 : 0)
console.log('  meals   :', meals.length, `(${newMeals} new)`)
console.log('  workouts:', workouts.length, `(${newWorkouts} new)`)
console.log('  weights :', weights.length, `(${newWeights} new)`)
console.log('  journal :', journal.length, `(${newJournal} new)`)
console.log('  plans   :', plans.length, `(${newPlans} new)`)