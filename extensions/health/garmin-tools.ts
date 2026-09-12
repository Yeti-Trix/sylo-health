import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

import { openHealthDb } from '../../shared/nutrition-store.js'
import { fetchGarminDay } from '../../shared/garmin-fetch.js'
import {
  buildGarminRangeSummary,
  buildGarminReport,
  enrichGarminEntries,
  extractGarminDaily,
  listGarminForRangeArg,
  stripRawJsonEntries,
  upsertGarminDaily,
} from '../../shared/garmin-store.js'
import { resolveRangeBounds, eachDayInRange, localDayBounds } from '../../shared/date-range.js'

type ToolContentBlock = { type: 'text'; text: string }

const dateRangeSchema = {
  date: Type.Optional(
    Type.String({
      description: 'Single calendar day (YYYY-MM-DD). Used when start_date/end_date omitted.',
    }),
  ),
  start_date: Type.Optional(
    Type.String({ description: 'Range start day inclusive (YYYY-MM-DD)' }),
  ),
  end_date: Type.Optional(
    Type.String({ description: 'Range end day inclusive (YYYY-MM-DD)' }),
  ),
}

function toolError(text: string): { content: ToolContentBlock[] } {
  return { content: [{ type: 'text', text }] }
}

function ok(summary: string, data: unknown): { content: ToolContentBlock[] } {
  return {
    content: [
      { type: 'text', text: summary },
      { type: 'text', text: JSON.stringify(data, null, 2) },
    ],
  }
}

function withDb<T>(fn: (db: ReturnType<typeof openHealthDb>) => T): T | { content: ToolContentBlock[] } {
  let db: ReturnType<typeof openHealthDb> | undefined
  try {
    db = openHealthDb()
    return fn(db)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return toolError(message)
  } finally {
    db?.close()
  }
}

/** Auto-sync the most recent days (today + yesterday) to ensure data freshness.
 *
 *  Called automatically by `sylo_health_garmin_report` and `_summary` before
 *  reading from the store, so the AI can never accidentally serve stale data.
 *  Silent — if the sync fails (watch not connected, token expired, etc.),
 *  the report still returns whatever is in the store. The `auto_sync` field
 *  in the response tells the AI which days were freshly synced vs cached.
 *
 *  Only syncs today + yesterday. Historical days don't change — Garmin
 *  doesn't revise last week's sleep score — so there's no need to re-sync
 *  the full range. This keeps the auto-sync to ~2-3 seconds.
 */
async function autoSyncRecentDays(
  db: ReturnType<typeof openHealthDb>,
): Promise<{ synced: string[]; failed: string[]; errors: string[] }> {
  const todayStr = localDayBounds(Date.now()).date
  const yesterdayStr = localDayBounds(Date.now() - 86_400_000).date
  const days = [todayStr, yesterdayStr]

  const synced: string[] = []
  const failed: string[] = []
  const errors: string[] = []

  for (const ds of days) {
    try {
      const { dump } = await fetchGarminDay(ds)
      const row = extractGarminDaily(ds, dump)
      upsertGarminDaily(db, row)
      synced.push(ds)
    } catch (e) {
      failed.push(ds)
      errors.push(`${ds}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { synced, failed, errors }
}

export function registerGarminTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'sylo_health_garmin_sync',
    label: 'Sync Garmin Connect metrics',
    description:
      'Pull daily Garmin Connect (Venu 4) metrics for a day (date) or inclusive range (start_date + end_date) via the Python sidecar and upsert them into the health store. Idempotent: re-pulling a day updates it in place. Non-interactive — requires a cached Garmin token (run the sidecar interactively once to complete first-time MFA). Max 14 days per call.',
    parameters: Type.Object({
      ...dateRangeSchema,
    }),
    async execute(_id, params) {
      const range = resolveRangeBounds({
        date: params.date,
        start_date: params.start_date,
        end_date: params.end_date,
      })
      const days = eachDayInRange(range.start_ms, range.end_ms)
      if (days.length === 0) return toolError('No days in the requested range.')
      if (days.length > 14) {
        return toolError(
          `Range too large (${days.length} days). Sync a max of 14 days per call.`,
        )
      }
      const dayStrings = days.map((ms) => new Date(ms).toISOString().slice(0, 10))

      const results: { date: string; ok: boolean; error?: string; warnings?: string[] }[] = []
      // Pull + upsert each day. Keep the store open across the whole sync.
      let db: ReturnType<typeof openHealthDb> | undefined
      try {
        db = openHealthDb()
        for (const ds of dayStrings) {
          try {
            const { dump, warnings } = await fetchGarminDay(ds)
            const row = extractGarminDaily(ds, dump)
            upsertGarminDaily(db, row)
            results.push({ date: ds, ok: true, warnings: warnings.length ? warnings : undefined })
          } catch (e) {
            results.push({
              date: ds,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            })
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return toolError(`Garmin sync failed to open health store: ${msg}`)
      } finally {
        db?.close()
      }

      const okCount = results.filter((r) => r.ok).length
      const failCount = results.length - okCount
      const summaryLines = results.map((r) =>
        r.ok ?
          `  ${r.date}: synced${r.warnings?.length ? ` (warnings: ${r.warnings.join('; ')})` : ''}`
        : `  ${r.date}: FAILED — ${r.error ?? 'unknown error'}`,
      )
      return ok(
        `Garmin sync ${okCount}/${results.length} days synced${failCount ? `, ${failCount} failed` : ''}.\n${summaryLines.join('\n')}`,
        { results },
      )
    },
  })

  pi.registerTool({
    name: 'sylo_health_garmin_list',
    label: 'List Garmin daily metrics',
    description:
      'List stored Garmin daily metrics for a day (date) or inclusive range (start_date + end_date). Defaults to today. These are previously-synced rows; call sylo_health_garmin_sync first to pull from Garmin Connect.',
    parameters: Type.Object({
      ...dateRangeSchema,
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    }),
    async execute(_id, params) {
      return withDb((db) => {
        const entries = listGarminForRangeArg(db, {
          date: params.date,
          start_date: params.start_date,
          end_date: params.end_date,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
        })
        const enriched = enrichGarminEntries(entries)
        // Strip raw_json to keep LLM context small — raw data stays in the
        // ndjson store for analytics and re-extraction.
        const stripped = stripRawJsonEntries(enriched)
        return ok(
          entries.length === 0 ?
            'No synced Garmin rows in range. Call sylo_health_garmin_sync first.'
          : `Found ${entries.length} Garmin day(s).`,
          { entries: stripped },
        )
      })
    },
  })

  pi.registerTool({
    name: 'sylo_health_garmin_summary',
    label: 'Garmin range summary',
    description:
      'Stored Garmin daily metrics over a day or date range (start_date + end_date). Returns the entries for charting. Defaults to a wide recent window. Auto-syncs today + yesterday before reading so data is always fresh. Raw_json is stripped from responses to keep context small.',
    parameters: Type.Object({
      ...dateRangeSchema,
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    }),
    async execute(_id, params) {
      let db: ReturnType<typeof openHealthDb> | undefined
      try {
        db = openHealthDb()

        // Auto-sync recent days (today + yesterday) to ensure freshness.
        const syncResult = await autoSyncRecentDays(db)

        const summary = buildGarminRangeSummary(db, {
          date: params.date,
          start_date: params.start_date,
          end_date: params.end_date,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
        })
        const enriched = enrichGarminEntries(summary.entries)
        const stripped = stripRawJsonEntries(enriched)

        const syncNote = syncResult.synced.length
          ? ` Auto-synced: ${syncResult.synced.join(', ')}.`
          : syncResult.failed.length
            ? ` Auto-sync failed (${syncResult.failed.join(', ')}). Using cached data.`
            : ''

        return ok(
          `Garmin ${summary.start_date} → ${summary.end_date}: ${summary.entry_count} day(s).${syncNote}`,
          { summary: { ...summary, entries: stripped }, auto_sync: syncResult },
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return toolError(message)
      } finally {
        db?.close()
      }
    },
  })

  pi.registerTool({
    name: 'sylo_health_garmin_report',
    label: 'Garmin coaching report',
    description:
      'Compact Garmin recovery report for a day (date) or inclusive range (start_date + end_date). Returns per-day coaching summaries with computed fields (sleep hours, deep/REM percentages, training readiness level/feedback, HRV status, sleep feedback codes) plus min/avg/max aggregates with coverage counts (count/total) across the range for key metrics. Auto-syncs today + yesterday before reading so data is always fresh. No raw_json — designed to be context-efficient for LLM coaching decisions.',
    parameters: Type.Object({
      ...dateRangeSchema,
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    }),
    async execute(_id, params) {
      let db: ReturnType<typeof openHealthDb> | undefined
      try {
        db = openHealthDb()

        // Auto-sync recent days (today + yesterday) to ensure freshness.
        const syncResult = await autoSyncRecentDays(db)

        const report = buildGarminReport(db, {
          date: params.date,
          start_date: params.start_date,
          end_date: params.end_date,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
        })

        // Build a concise text summary for the first content block
        const lines: string[] = []
        lines.push(`Garmin Report: ${report.start_date} → ${report.end_date} (${report.day_count} day(s))`)

        // Auto-sync status line
        if (syncResult.synced.length > 0) {
          lines.push(`  Auto-synced: ${syncResult.synced.join(', ')}`)
        }
        if (syncResult.failed.length > 0) {
          lines.push(`  Auto-sync failed: ${syncResult.failed.join(', ')} — using cached data`)
        }

        if (report.day_count === 0) {
          lines.push('No synced Garmin data in range.')
        } else {
          // Aggregate summary line (includes count/total for coverage disclosure)
          const a = report.aggregates
          const parts: string[] = []
          if (a.training_readiness) parts.push(`Readiness ${a.training_readiness.min}-${a.training_readiness.max} (avg ${a.training_readiness.avg}, ${a.training_readiness.count}/${a.training_readiness.total} days)`)
          if (a.hrv_avg) parts.push(`HRV ${a.hrv_avg.min}-${a.hrv_avg.max} (avg ${a.hrv_avg.avg}, ${a.hrv_avg.count}/${a.hrv_avg.total} days)`)
          if (a.body_battery_charged) parts.push(`BB charged ${a.body_battery_charged.min}-${a.body_battery_charged.max} (avg ${a.body_battery_charged.avg}, ${a.body_battery_charged.count}/${a.body_battery_charged.total} days)`)
          if (a.deep_sleep_hours) parts.push(`Deep sleep ${a.deep_sleep_hours.min}-${a.deep_sleep_hours.max}h (avg ${a.deep_sleep_hours.avg}h, ${a.deep_sleep_hours.count}/${a.deep_sleep_hours.total} days)`)
          if (a.stress_avg) parts.push(`Stress ${a.stress_avg.min}-${a.stress_avg.max} (avg ${a.stress_avg.avg}, ${a.stress_avg.count}/${a.stress_avg.total} days)`)
          if (a.sleep_score) parts.push(`Sleep score ${a.sleep_score.min}-${a.sleep_score.max} (avg ${a.sleep_score.avg}, ${a.sleep_score.count}/${a.sleep_score.total} days)`)
          if (parts.length) lines.push(`  Aggregates: ${parts.join(', ')}`)

          // Per-day one-liners (now include updated_at timestamp)
          for (const d of report.days) {
            const tr = d.training_readiness.score != null ? `${d.training_readiness.score}(${d.training_readiness.level ?? '?'})` : '?'
            const bb = d.body_battery.charged != null ? `BB${d.body_battery.charged}` : 'BB?'
            const hrv = d.hrv.avg != null ? `HRV${d.hrv.avg}` : 'HRV?'
            const sleep = d.sleep.total_hours != null ? `${d.sleep.total_hours}h` : 'sleep?'
            const deep = d.sleep.deep_hours != null ? `${d.sleep.deep_hours}h deep` : ''
            const ss = d.sleep.score != null ? `SS${d.sleep.score}` : ''
            const stress = d.vitals.stress_avg != null ? `str${d.vitals.stress_avg}` : ''
            const rhr = d.vitals.resting_hr != null ? `RHR${d.vitals.resting_hr}` : ''
            const info = [tr, bb, hrv, sleep, deep, ss, stress, rhr].filter(Boolean).join(' ')
            lines.push(`  ${d.date} ${d.day_of_week}: ${info}`)
          }
        }

        return ok(lines.join('\n'), { report, auto_sync: syncResult })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return toolError(message)
      } finally {
        db?.close()
      }
    },
  })

  pi.registerTool({
    name: 'sylo_health_sync',
    label: 'Silent Garmin background sync',
    description:
      'Silent background sync of Garmin Connect metrics. Pulls a wide range (up to 93 days) without returning metric data to LLM context — only a one-line status summary. Handles batching internally. Use for scheduled prompts, startup freshness checks, or pre-report syncs when you want data fresh but do not need the numbers in context. For single-day or small-range syncs with per-day status, use sylo_health_garmin_sync instead.',
    parameters: Type.Object({
      ...dateRangeSchema,
    }),
    async execute(_id, params) {
      const range = resolveRangeBounds({
        date: params.date,
        start_date: params.start_date,
        end_date: params.end_date,
      })
      const days = eachDayInRange(range.start_ms, range.end_ms)
      if (days.length === 0) return toolError('No days in the requested range.')
      if (days.length > 93) {
        return toolError(
          `Range too large (${days.length} days). Sync a max of 93 days per call. Use multiple calls for wider ranges.`,
        )
      }
      const dayStrings = days.map((ms) => localDayBounds(ms).date)

      let okCount = 0
      let failCount = 0
      let db: ReturnType<typeof openHealthDb> | undefined
      try {
        db = openHealthDb()
        for (const ds of dayStrings) {
          try {
            const { dump } = await fetchGarminDay(ds)
            const row = extractGarminDaily(ds, dump)
            upsertGarminDaily(db, row)
            okCount++
          } catch {
            failCount++
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return toolError(`Garmin sync failed to open health store: ${msg}`)
      } finally {
        db?.close()
      }

      return ok(
        `Synced ${okCount}/${days.length} days (${range.start_date} to ${range.end_date})${failCount ? `, ${failCount} failed` : ''}.`,
        { synced: okCount, failed: failCount, total: days.length, range: { start_date: range.start_date, end_date: range.end_date } },
      )
    },
  })
}