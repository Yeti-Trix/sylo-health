/**
 * Integration tests for meal + workout persistence (maps to TEST_PROMPTS.md N/W scenarios).
 * Run: npm run test:store -w packages/sylo-health
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, before, after } from 'node:test'

import { HealthStore } from './health-store.ts'

import {
  buildDailySummariesForRangeArg,
  buildDailySummaryForDateArg,
  deleteMealLog,
  enrichMealLogEntry,
  getHealthProfile,
  insertMealLog,
  listMealLogsForRangeArg,
  parseProfileInput,
  setHealthProfile,
  updateMealLog,
  validateProfileParams,
} from './nutrition-store.ts'
import {
  deleteJournalEntry,
  insertJournalEntry,
  listActiveJournalEntries,
  listJournalForRangeArg,
  updateJournalEntry,
} from './journal-store.ts'
import {
  buildMuscleSummary,
  buildWorkoutRangeSummary,
  deleteWorkoutLog,
  insertWorkoutLog,
  listWorkoutsForRangeArg,
  searchExerciseHistory,
  updateWorkoutLog,
} from './workout-store.ts'
import {
  buildWeightRangeSummary,
  deleteWeightLog,
  enrichWeightEntry,
  insertWeightLog,
  listWeightsForRangeArg,
  updateWeightLog,
} from './weight-store.ts'
import {
  archiveActivePlan,
  getActivePlan,
  insertWorkoutPlan,
  listWorkoutPlans,
} from './plan-store.ts'
import { localDayBounds, resolveDateMs, resolveLoggedAt } from './date-range.ts'

let dbDir
let db

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAhead(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

before(() => {
  dbDir = path.join(os.tmpdir(), `sylo-health-test-${Date.now()}`)
  db = new HealthStore(dbDir)
  setHealthProfile(db, {
    height_cm: 180,
    weight_lb: 187.4,
    weight_kg: 85,
    age_years: 34,
    sex: 'male',
    activity_level: 'moderate',
    target_weight_lb: 172,
    target_weight_kg: 78,
  })
})

after(() => {
  if (db) db.close()
  if (dbDir) {
    fs.rmSync(dbDir, { recursive: true, force: true })
  }
})

test('N1 profile exists with targets', () => {
  const p = getHealthProfile(db)
  assert.ok(p)
  assert.ok(p.daily_calorie_target > 0)
  assert.ok(p.protein_g_target > 0)
  assert.equal(p.weight_lb, 187.4)
  assert.equal(p.target_weight_lb, 172)
})

test('P1 profile_set accepts weight_lb as canonical', () => {
  assert.equal(
    validateProfileParams({
      height_cm: 180,
      weight_lb: 190,
      age_years: 34,
      sex: 'male',
      activity_level: 'moderate',
      target_weight_lb: 175,
    }),
    null,
  )
  const input = parseProfileInput({
    height_cm: 180,
    weight_lb: 190,
    age_years: 34,
    sex: 'male',
    activity_level: 'moderate',
    target_weight_lb: 175,
  })
  setHealthProfile(db, input)
  const p = getHealthProfile(db)
  assert.equal(p.weight_lb, 190)
  assert.equal(p.target_weight_lb, 175)
  assert.ok(p.weight_kg > 0)
})

test('N2 log meal on yesterday', () => {
  const yesterday = daysAgo(1)
  const entry = insertMealLog(db, {
    description: 'grilled chicken salad',
    items: [
      { name: 'salad', calories: 450, protein_g: 40, carbs_g: 25, fat_g: 18 },
    ],
    source: 'operator_text',
    logged_at: resolveLoggedAt({ date: yesterday }),
  })
  const { start, end } = localDayBounds(resolveDateMs(yesterday))
  assert.ok(entry.logged_at >= start && entry.logged_at <= end)
})

test('N3 list yesterday meals', () => {
  const entries = listMealLogsForRangeArg(db, { date: daysAgo(1) })
  assert.ok(entries.length >= 1)
})

test('enrichMealLogEntry adds local date/time fields', () => {
  const yesterday = daysAgo(1)
  const entries = listMealLogsForRangeArg(db, { date: yesterday })
  assert.ok(entries.length >= 1)
  const enriched = enrichMealLogEntry(entries[0])
  assert.equal(enriched.logged_date, yesterday)
  assert.ok(enriched.logged_day_of_week)
  assert.equal(enriched.logged_time, '12:00')
  assert.ok(enriched.logged_datetime_local?.includes(enriched.logged_day_of_week))
})

test('daily summary includes day_of_week', () => {
  const summary = buildDailySummaryForDateArg(db, '2026-06-08')
  assert.ok(summary)
  assert.equal(summary.day_of_week, 'Monday')
})

test('N4 daily summaries last 7 days', () => {
  const summaries = buildDailySummariesForRangeArg(db, {
    start_date: daysAgo(6),
    end_date: daysAgo(0),
  })
  assert.equal(summaries.length, 7)
})

test('N6 update meal calories', () => {
  const entries = listMealLogsForRangeArg(db, { date: daysAgo(1) })
  const id = entries[0].id
  const updated = updateMealLog(db, id, {
    items: [{ name: 'salad', calories: 500, protein_g: 45, carbs_g: 25, fat_g: 18 }],
  })
  assert.equal(updated.calories, 500)
})

test('N7 delete meal', () => {
  const entries = listMealLogsForRangeArg(db, { date: daysAgo(1) })
  const id = entries[0].id
  assert.ok(deleteMealLog(db, id))
  assert.equal(listMealLogsForRangeArg(db, { date: daysAgo(1) }).length, 0)
})

test('N8 remaining macros today', () => {
  insertMealLog(db, {
    description: 'test snack',
    items: [{ name: 'snack', calories: 200, protein_g: 10, carbs_g: 20, fat_g: 8 }],
    source: 'operator_text',
  })
  const summary = buildDailySummaryForDateArg(db)
  assert.ok(summary.remaining.calories < summary.targets.calories)
})

test('W1 log workout yesterday', () => {
  const { entry } = insertWorkoutLog(db, {
    title: 'easy run',
    duration_min: 45,
    calories_burned: 400,
    date: daysAgo(1),
  })
  const { start, end } = localDayBounds(resolveDateMs(daysAgo(1)))
  assert.ok(entry.logged_at >= start && entry.logged_at <= end)
})

test('W2 log workout future day', () => {
  const tuesday = daysAhead(3)
  const { entry } = insertWorkoutLog(db, {
    title: 'upper body',
    duration_min: 50,
    exercises: [
      { name: 'bench press', sets: 3, reps: 10 },
      { name: 'rows', sets: 3, reps: 10 },
    ],
    date: tuesday,
  })
  const { date } = localDayBounds(entry.logged_at)
  assert.equal(date, tuesday)
})

test('W3 list workouts last 7 days', () => {
  const entries = listWorkoutsForRangeArg(db, {
    start_date: daysAgo(6),
    end_date: daysAgo(0),
  })
  assert.ok(entries.length >= 1)
})

test('W4 workout summary last 30 days', () => {
  const summary = buildWorkoutRangeSummary(db, {
    start_date: daysAgo(29),
    end_date: daysAgo(0),
  })
  assert.ok(summary.workout_count >= 1)
  assert.ok(summary.total_duration_min >= 45)
})

test('W5 update workout duration', () => {
  const entries = listWorkoutsForRangeArg(db, { date: daysAgo(1) })
  const id = entries[0].id
  const updated = updateWorkoutLog(db, id, { duration_min: 50, calories_burned: 450 })
  assert.equal(updated.duration_min, 50)
  assert.equal(updated.calories_burned, 450)
})

test('W7 move workout to another day', () => {
  const entries = listWorkoutsForRangeArg(db, { date: daysAhead(3) })
  const id = entries[0].id
  const wednesday = daysAhead(4)
  const moved = updateWorkoutLog(db, id, { date: wednesday })
  const { date } = localDayBounds(moved.logged_at)
  assert.equal(date, wednesday)
})

test('W6 delete workout', () => {
  const entries = listWorkoutsForRangeArg(db, { date: daysAgo(1) })
  if (entries.length) {
    assert.ok(deleteWorkoutLog(db, entries[0].id))
  }
})

test('V1 log weight today updates profile', () => {
  insertWeightLog(db, { weight_lb: 185.6 })
  const p = getHealthProfile(db)
  assert.ok(Math.abs(p.weight_kg - 84.2) < 0.2)
})

test('V2 log weight on past day stores lbs', () => {
  const d = daysAgo(3)
  const entry = insertWeightLog(db, { weight_lb: 188, date: d })
  const enriched = enrichWeightEntry(entry)
  assert.equal(enriched.logged_date, d)
  assert.equal(enriched.weight_lb, 188)
})

test('V3 list weight last 7 days', () => {
  const entries = listWeightsForRangeArg(db, {
    start_date: daysAgo(6),
    end_date: daysAgo(0),
  })
  assert.ok(entries.length >= 1)
})

test('V4 weight summary change in range', () => {
  insertWeightLog(db, { weight_lb: 183, date: daysAgo(5) })
  const summary = buildWeightRangeSummary(db, {
    start_date: daysAgo(6),
    end_date: daysAgo(0),
  })
  assert.ok(summary.entry_count >= 2)
  assert.ok(summary.latest_weight_kg != null)
})

test('V5 update weight entry', () => {
  const entries = listWeightsForRangeArg(db, { date: daysAgo(3) })
  const id = entries[0].id
  const updated = updateWeightLog(db, id, { weight_lb: 190 })
  assert.equal(updated.weight_lb, 190)
})

test('V6 delete weight entry', () => {
  const entries = listWeightsForRangeArg(db, { date: daysAgo(3) })
  assert.ok(deleteWeightLog(db, entries[0].id))
})

test('J1 add journal note', () => {
  const entry = insertJournalEntry(db, {
    body: 'Back has been hurting this week',
    category: 'pain',
  })
  assert.ok(entry.body.includes('Back'))
  assert.equal(entry.active, true)
})

test('J2 list journal notes', () => {
  const entries = listJournalForRangeArg(db, {
    start_date: daysAgo(6),
    end_date: daysAgo(0),
  })
  assert.ok(entries.length >= 1)
})

test('J3 update journal note', () => {
  const entries = listJournalForRangeArg(db, { date: daysAgo(0) })
  const id = entries[0].id
  const updated = updateJournalEntry(db, id, { body: 'Back improving after stretching' })
  assert.ok(updated.body.includes('improving'))
})

test('J4 delete journal note', () => {
  const entries = listJournalForRangeArg(db, { date: daysAgo(0) })
  assert.ok(deleteJournalEntry(db, entries[0].id))
})

test('J5 active journal notes list for coaching context', () => {
  insertJournalEntry(db, { body: 'Lower back tight on deadlifts', category: 'pain' })
  insertJournalEntry(db, { body: 'Hit bench PR', category: 'coach_note' })
  const active = listActiveJournalEntries(db)
  assert.ok(active.some((e) => e.body.includes('Lower back')))
  assert.ok(!active.some((e) => e.body.includes('bench PR')))
})

test('J6 resolve journal note clears active flag', () => {
  const entry = insertJournalEntry(db, {
    body: 'Shoulder pain on overhead press',
    category: 'injury',
  })
  const resolved = updateJournalEntry(db, entry.id, { active: false })
  assert.equal(resolved.active, false)
  assert.equal(listActiveJournalEntries(db).some((e) => e.id === entry.id), false)
})

test('T1 exercise history finds bench across dates', () => {
  insertWorkoutLog(db, {
    title: 'push day',
    date: daysAgo(10),
    exercises: [
      {
        name: 'barbell bench press',
        sets: 3,
        reps: 8,
        weight_lb: 185,
        muscle_groups: ['chest', 'triceps', 'shoulders'],
      },
    ],
  })
  insertWorkoutLog(db, {
    title: 'push day',
    date: daysAgo(3),
    exercises: [{ name: 'barbell bench press', sets: 3, reps: 8, weight_lb: 195 }],
  })
  const hits = searchExerciseHistory(db, { name: 'barbell bench' })
  assert.ok(hits.length >= 2)
  assert.ok(hits.some((h) => h.exercise.weight_lb === 195))
  assert.ok(hits.some((h) => h.exercise.weight_lb === 185))
})

test('T2 planned workout status', () => {
  const { entry } = insertWorkoutLog(db, {
    title: 'leg day',
    status: 'planned',
    date: daysAhead(2),
    exercises: [{ name: 'squat', sets: 4, reps: 6, muscle_groups: ['quads', 'glutes'] }],
  })
  assert.equal(entry.status, 'planned')
  const planned = listWorkoutsForRangeArg(db, {
    start_date: daysAgo(0),
    end_date: daysAhead(7),
    status: 'planned',
  })
  assert.ok(planned.some((p) => p.id === entry.id))
})

test('T3 mark planned workout completed', () => {
  const planned = listWorkoutsForRangeArg(db, {
    start_date: daysAgo(0),
    end_date: daysAhead(7),
    status: 'planned',
  })
  const id = planned[0].id
  const done = updateWorkoutLog(db, id, {
    status: 'completed',
    exercises: [{ name: 'squat', sets: 4, reps: 6, weight_lb: 225 }],
  })
  assert.equal(done.status, 'completed')
})

test('T4 muscle summary aggregates tagged exercises', () => {
  insertWorkoutLog(db, {
    title: 'pull',
    date: daysAgo(2),
    exercises: [
      { name: 'rows', sets: 3, reps: 10, weight_lb: 110, muscle_groups: ['back', 'biceps'] },
    ],
  })
  const summary = buildMuscleSummary(db, {
    start_date: daysAgo(14),
    end_date: daysAgo(0),
  })
  const back = summary.groups.find((g) => g.muscle_group === 'back')
  assert.ok(back)
  assert.ok(back.session_count >= 1)
})

test('U1 workout stores weight_lb from operator input', () => {
  const { entry } = insertWorkoutLog(db, {
    title: 'legs',
    exercises: [{ name: 'squat', sets: 5, reps: 5, weight_lb: 315 }],
  })
  assert.equal(entry.exercises[0].weight_lb, 315)
  assert.ok(entry.exercises[0].weight_kg > 0)
})

test('T6 completed log replaces planned session on same day', () => {
  const day = daysAhead(5)
  const { entry: planned } = insertWorkoutLog(db, {
    title: 'push day',
    status: 'planned',
    date: day,
    exercises: [{ name: 'bench press', sets: 3, reps: 8, weight_lb: 185 }],
  })
  const { entry: completed, replaced_planned } = insertWorkoutLog(db, {
    title: 'push day',
    date: day,
    exercises: [{ name: 'bench press', sets: 3, reps: 8, weight_lb: 195 }],
  })
  assert.equal(replaced_planned, true)
  assert.equal(completed.id, planned.id)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.exercises[0].weight_lb, 195)
  const dayEntries = listWorkoutsForRangeArg(db, { date: day })
  assert.equal(dayEntries.length, 1)
})

test('T5 workout summary status counts', () => {
  const summary = buildWorkoutRangeSummary(db, {
    start_date: daysAgo(14),
    end_date: daysAhead(7),
  })
  assert.ok(summary.completed_count >= 1)
  assert.ok(typeof summary.planned_count === 'number')
})

test('PL1 insert plan becomes active', () => {
  const plan = insertWorkoutPlan(db, {
    title: 'PPL 3-day',
    days: [
      { day: 'Monday', focus: 'Push', exercises: [{ name: 'bench press', sets: 3, reps: 8, weight_lb: 185 }] },
      { day: 'Wednesday', focus: 'Pull', exercises: [{ name: 'rows', sets: 3, reps: 10, weight_lb: 135 }] },
      { day: 'Friday', focus: 'Legs', exercises: [{ name: 'squat', sets: 5, reps: 5, weight_lb: 225 }] },
    ],
    rationale: 'initial program',
  })
  assert.equal(plan.status, 'active')
  assert.equal(plan.days.length, 3)
  assert.equal(plan.days[0].exercises[0].weight_lb, 185)
  assert.ok(plan.days[0].exercises[0].weight_kg > 0)
  const active = getActivePlan(db)
  assert.equal(active.id, plan.id)
})

test('PL2 new plan version archives previous', () => {
  const v2 = insertWorkoutPlan(db, {
    title: 'PPL 4-day',
    days: [
      { day: 'Monday', focus: 'Push', exercises: [{ name: 'bench press', sets: 3, reps: 8, weight_lb: 190 }] },
      { day: 'Tuesday', focus: 'Pull', exercises: [] },
      { day: 'Thursday', focus: 'Legs', exercises: [] },
      { day: 'Saturday', focus: 'Push', exercises: [] },
    ],
    rationale: 'added a 4th day; bench +5 lb',
  })
  const active = getActivePlan(db)
  assert.equal(active.id, v2.id)
  const all = listWorkoutPlans(db)
  assert.ok(all.length >= 2)
  const archived = all.filter((p) => p.status === 'archived')
  assert.ok(archived.length >= 1)
  assert.equal(all[0].id, v2.id)
})

test('PL3 archive active plan without replacement', () => {
  const archivedPlan = archiveActivePlan(db)
  assert.ok(archivedPlan)
  assert.equal(archivedPlan.status, 'archived')
  assert.equal(getActivePlan(db), null)
  assert.equal(archiveActivePlan(db), null)
})

test('PL4 plan requires title and at least one day', () => {
  assert.throws(() => insertWorkoutPlan(db, { title: '', days: [{ day: 'Mon', exercises: [] }] }))
  assert.throws(() => insertWorkoutPlan(db, { title: 'empty', days: [] }))
})

// --- Regression: NDJSON newline / concatenation corruption ---
// Reproduces the Aug 13 2026 incident where a manual git-merge edit left a
// meals month file without a trailing newline; the next appendLog joined two
// entries on one physical line (`{...}{...}`), and the old line-based loader
// silently dropped BOTH. The pepperoni/salami dinner vanished from the app
// even though it was on disk.

test('NDJSON appendLog inserts a leading newline when the file lacks one', () => {
  const dir = path.join(os.tmpdir(), `sylo-health-newline-${Date.now()}`)
  fs.mkdirSync(path.join(dir, 'meals'), { recursive: true })
  const fp = path.join(dir, 'meals', '2026-08.ndjson')
  // Seed one entry with NO trailing newline (simulates a manual merge edit).
  fs.writeFileSync(fp, JSON.stringify({ id: 'a', logged_at: 1786464000000 }))
  const store = new HealthStore(dir)
  store.appendLog('meals', { id: 'b', logged_at: 1786464000000 })
  const raw = fs.readFileSync(fp, 'utf8')
  assert.ok(!raw.includes('}{'), 'entries must not be concatenated on one line')
  assert.ok(raw.includes('}\n{'), 'a newline must separate the two entries')
  // A fresh store must load both objects.
  const store2 = new HealthStore(dir)
  assert.equal(store2.meals.length, 2)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('NDJSON load recovers entries concatenated on one line', () => {
  const dir = path.join(os.tmpdir(), `sylo-health-concat-${Date.now()}`)
  fs.mkdirSync(path.join(dir, 'meals'), { recursive: true })
  const fp = path.join(dir, 'meals', '2026-08.ndjson')
  // Two valid objects with NO newline between them (the corruption shape).
  const a = JSON.stringify({ id: 'a', logged_at: 1786464000000 })
  const b = JSON.stringify({ id: 'b', logged_at: 1786464000000 })
  fs.writeFileSync(fp, `${a}${b}\n`)
  const store = new HealthStore(dir)
  assert.equal(store.meals.length, 2, 'both concatenated entries should be recovered')
  assert.ok(store.meals.some((m) => m.id === 'a'))
  assert.ok(store.meals.some((m) => m.id === 'b'))
  fs.rmSync(dir, { recursive: true, force: true })
})
