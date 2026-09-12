/**
 * Run: npm run test:date-range -w packages/sylo-health
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  eachDayInRange,
  formatLocalLoggedAt,
  localDayBounds,
  localDayOfWeekFromDate,
  resolveDateMs,
  resolveLoggedAt,
  resolveRangeBounds,
} from './date-range.ts'

test('resolveRangeBounds single date', () => {
  const r = resolveRangeBounds({ date: '2026-06-01' })
  assert.equal(r.start_date, r.end_date)
})

test('resolveRangeBounds start and end', () => {
  const r = resolveRangeBounds({ start_date: '2026-06-01', end_date: '2026-06-07' })
  assert.equal(r.start_date, '2026-06-01')
  assert.equal(r.end_date, '2026-06-07')
  assert.equal(eachDayInRange(r.start_ms, r.end_ms).length, 7)
})

test('resolveLoggedAt uses noon local for explicit date', () => {
  const { start } = localDayBounds(resolveDateMs('2026-01-15'))
  assert.equal(resolveLoggedAt({ date: '2026-01-15' }), start + 12 * 60 * 60 * 1000)
})

test('formatLocalLoggedAt returns local calendar fields', () => {
  const ms = resolveLoggedAt({ date: '2026-06-08' })
  const f = formatLocalLoggedAt(ms)
  assert.equal(f.logged_date, '2026-06-08')
  assert.equal(f.logged_day_of_week, 'Monday')
  assert.equal(f.logged_time, '12:00')
  assert.equal(f.logged_datetime_local, 'Monday 2026-06-08 12:00')
  assert.equal(f.logged_at, ms)
})

test('localDayOfWeekFromDate matches calendar', () => {
  assert.equal(localDayOfWeekFromDate('2026-06-08'), 'Monday')
  assert.equal(localDayOfWeekFromDate('2026-06-07'), 'Sunday')
})
