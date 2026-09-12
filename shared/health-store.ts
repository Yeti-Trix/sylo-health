/**
 * JSON-backed health storage — replaces the SQLite operator DB.
 *
 * Data lives as plain text under `<sylo-user>/health/` so it is git-mergeable
 * (NDJSON append-only logs, one file per month per type) and dashboard-readable:
 *
 *   health/
 *     profile.json              singleton (height/weight/targets)
 *     plans/<plan-id>.json      one file per plan version
 *     meals/    YYYY-MM.ndjson  one entry per line
 *     workouts/ YYYY-MM.ndjson
 *     weight/   YYYY-MM.ndjson
 *     journal/  YYYY-MM.ndjson
 *
 * Each mutation persists immediately (append a line, rewrite a small month
 * file, or rewrite a single plan file). `close()` is a no-op — there is no
 * database handle to release. See feature tracker
 * 2026-08-02_14-53-03_sylo_health_db_to_sylo_user.md (scope-based storage).
 */
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { formatLocalLoggedAt } from './date-range.js'
import type {
  GarminDailyRow,
  HealthJournalEntryRow,
  HealthProfileRow,
  MealLogEntryRow,
  WorkoutLogEntryRow,
  WorkoutPlanRow,
  WeightLogEntryRow,
} from './types.js'

export type LogKind = 'meals' | 'workouts' | 'weights' | 'journal' | 'garmin'

const LOG_SUBDIR: Record<LogKind, string> = {
  meals: 'meals',
  workouts: 'workouts',
  weights: 'weight',
  journal: 'journal',
  garmin: 'garmin',
}

type AnyLogRow =
  | MealLogEntryRow
  | WorkoutLogEntryRow
  | WeightLogEntryRow
  | HealthJournalEntryRow
  | GarminDailyRow

/**
 * Parse every top-level JSON object out of a log file's text.
 *
 * Replaces a naive `text.split('\n')` + per-line `JSON.parse`. The line split
 * silently dropped BOTH entries when an append without a leading newline
 * joined two objects on one physical line (`{...}{...}`) — that single line
 * failed to parse and was swallowed by the catch block, hiding real data (the
 * Aug 12 2026 "pepperoni/salami" dinner was lost exactly this way). A
 * bracket/depth scan that is aware of string literals recovers every
 * well-formed object regardless of whether newlines separate them; only a
 * genuinely malformed fragment is skipped (with a warning).
 */
function parseLogObjects(text: string): AnyLogRow[] {
  const out: AnyLogRow[] = []
  let skipped = 0
  let depth = 0
  let inStr = false
  let esc = false
  let start = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try {
          out.push(JSON.parse(text.slice(start, i + 1)) as AnyLogRow)
        } catch {
          skipped++
        }
        start = -1
      }
    }
  }
  if (skipped > 0) {
    console.warn(`[sylo-health] skipped ${skipped} malformed NDJSON object(s) during load`)
  }
  return out
}

/** Operator-local YYYY-MM month key for an entry's logged_at (ms). */
export function monthKeyFromLoggedAt(loggedAtMs: number): string {
  return formatLocalLoggedAt(loggedAtMs).logged_date.slice(0, 7)
}

export class HealthStore {
  readonly dir: string
  profile: HealthProfileRow | null = null
  meals: MealLogEntryRow[] = []
  workouts: WorkoutLogEntryRow[] = []
  weights: WeightLogEntryRow[] = []
  journal: HealthJournalEntryRow[] = []
  garmin: GarminDailyRow[] = []
  plans: WorkoutPlanRow[] = []

  constructor(dir: string) {
    this.dir = dir
    this.load()
  }

  /** No database handle — nothing to release. Kept for the `withDb` close pattern. */
  close(): void {
    /* no-op */
  }

  // ---- load (read everything into memory once at open) ----

  private load(): void {
    mkdirSync(this.dir, { recursive: true })
    this.profile = this.loadProfile()
    this.plans = this.loadPlans()
    this.meals = this.loadLogs('meals') as MealLogEntryRow[]
    this.workouts = this.loadLogs('workouts') as WorkoutLogEntryRow[]
    this.weights = this.loadLogs('weights') as WeightLogEntryRow[]
    this.journal = this.loadLogs('journal') as HealthJournalEntryRow[]
    this.garmin = this.loadLogs('garmin') as GarminDailyRow[]
  }

  private loadProfile(): HealthProfileRow | null {
    const fp = join(this.dir, 'profile.json')
    if (!existsSync(fp)) return null
    try {
      return JSON.parse(readFileSync(fp, 'utf8')) as HealthProfileRow
    } catch {
      return null
    }
  }

  private loadPlans(): WorkoutPlanRow[] {
    const pd = join(this.dir, 'plans')
    if (!existsSync(pd)) return []
    const out: WorkoutPlanRow[] = []
    for (const f of readdirSync(pd)) {
      if (!f.endsWith('.json')) continue
      try {
        out.push(JSON.parse(readFileSync(join(pd, f), 'utf8')) as WorkoutPlanRow)
      } catch {
        /* skip malformed plan file */
      }
    }
    return out
  }

  private loadLogs(kind: LogKind): AnyLogRow[] {
    const sd = join(this.dir, LOG_SUBDIR[kind])
    if (!existsSync(sd)) return []
    const out: AnyLogRow[] = []
    for (const f of readdirSync(sd)) {
      if (!f.endsWith('.ndjson') && !f.endsWith('.jsonl')) continue
      const txt = readFileSync(join(sd, f), 'utf8')
      out.push(...parseLogObjects(txt))
    }
    return out
  }

  // ---- persist ----

  saveProfile(): void {
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(join(this.dir, 'profile.json'), JSON.stringify(this.profile, null, 2) + '\n')
  }

  /** Append one entry as a single NDJSON line to its month file (insert path). */
  appendLog(kind: LogKind, entry: { logged_at: number }): void {
    const sd = join(this.dir, LOG_SUBDIR[kind])
    mkdirSync(sd, { recursive: true })
    const mk = monthKeyFromLoggedAt(entry.logged_at)
    const fp = join(sd, `${mk}.ndjson`)
    // Guard: a bare append concatenates onto the last line when the file does
    // not end with a newline (e.g. after a manual git-merge edit). The result
    // is a single `{...}{...}` line that the loader must recover from — and
    // before the parseLogObjects fix, both entries were silently lost. Ensure
    // a leading newline whenever the existing file is non-empty and lacks a
    // trailing one.
    let prefix = ''
    if (existsSync(fp)) {
      const size = statSync(fp).size
      if (size > 0) {
        const fd = openSync(fp, 'r')
        try {
          const buf = Buffer.alloc(1)
          readSync(fd, buf, 0, 1, size - 1)
          if (buf[0] !== 0x0a) prefix = '\n'
        } finally {
          closeSync(fd)
        }
      }
    }
    appendFileSync(fp, prefix + JSON.stringify(entry) + '\n')
  }

  /**
   * Rewrite a whole month file from the current in-memory entries of `kind`
   * that fall in `monthKey` (used by update/delete). Sorted by logged_at asc
   * for deterministic output. An empty month removes the file.
   */
  rewriteLogMonth(kind: LogKind, monthKey: string): void {
    const sd = join(this.dir, LOG_SUBDIR[kind])
    mkdirSync(sd, { recursive: true })
    const fp = join(sd, `${monthKey}.ndjson`)
    const arr = this.collection(kind)
      .filter((e) => monthKeyFromLoggedAt(e.logged_at) === monthKey)
      .sort((a, b) => a.logged_at - b.logged_at)
    if (arr.length === 0) {
      if (existsSync(fp)) rmSync(fp)
      return
    }
    writeFileSync(fp, arr.map((e) => JSON.stringify(e)).join('\n') + '\n')
  }

  /** Write one plan version to `plans/<id>.json`. */
  savePlan(plan: WorkoutPlanRow): void {
    const pd = join(this.dir, 'plans')
    mkdirSync(pd, { recursive: true })
    writeFileSync(join(pd, `${plan.id}.json`), JSON.stringify(plan, null, 2) + '\n')
  }

  /** Remove a plan file (used when a version is deleted — currently unused but available). */
  deletePlanFile(id: string): void {
    const fp = join(this.dir, 'plans', `${id}.json`)
    if (existsSync(fp)) rmSync(fp)
  }

  private collection(kind: LogKind): AnyLogRow[] {
    return kind === 'meals' ? this.meals
      : kind === 'workouts' ? this.workouts
      : kind === 'weights' ? this.weights
      : kind === 'garmin' ? this.garmin
      : this.journal
  }

  /** Idempotent upsert of a Garmin daily row by `date`. Replaces an existing
   * row for the same calendar date or appends a new one, then rewrites the
   * month file. Re-pulling a day updates it in place (no duplicates). */
  upsertGarminDaily(row: GarminDailyRow): void {
    const idx = this.garmin.findIndex((e) => e.date === row.date)
    if (idx >= 0) this.garmin[idx] = row
    else this.garmin.push(row)
    this.rewriteLogMonth('garmin', monthKeyFromLoggedAt(row.logged_at))
  }
}

/**
 * Resolve the health data directory (personal-plugin host contract, 2026-09-01).
 *
 * 1. `SYLO_PERSONAL_DATA_DIR` — explicit data-dir override (Settings pref).
 * 2. `SYLO_HEALTH_DIR` — legacy explicit dir (pre-split sylo-dev host).
 * 3. `SYLO_PERSONAL_DATA_ROOT` — generic data root (`<sylo-user>`) → `<root>/health`.
 * 4. Legacy DB-path derivation (pre-split sylo-dev host).
 * 5. `SYLO_USER_DIR` — operator workspace → `<dir>/health`.
 */
export function resolveHealthDir(): string | null {
  // 1. Explicit data-dir override (Settings → Health data → `sylo.personal.data_dir`,
  //    passed by the host as SYLO_PERSONAL_DATA_DIR).
  const dataDir = process.env.SYLO_PERSONAL_DATA_DIR?.trim()
  if (dataDir) return dataDir
  // 2. Legacy explicit dir env (pre-split sylo-dev host).
  const direct = process.env.SYLO_HEALTH_DIR?.trim()
  if (direct) return direct
  // 3. Derive from the generic data root the host passes (`<sylo-user>`): `<root>/health`.
  const dataRoot = process.env.SYLO_PERSONAL_DATA_ROOT?.trim()
  if (dataRoot) return join(dataRoot, 'health')
  // 4. Legacy DB-path derivation (pre-split sylo-dev host).
  const dbPath = process.env.SYLO_HEALTH_DB_PATH?.trim() || process.env.SYLO_DB_PATH?.trim()
  if (dbPath) {
    // up from `<root>/.sylo/operator.sqlite` to `<root>`, then into `health/`
    const r = dirname(dirname(dbPath))
    return join(r, 'health')
  }
  // 5. Last resort: the operator workspace the broker inherited.
  const userDir = process.env.SYLO_USER_DIR?.trim()
  if (userDir) return join(userDir, 'health')
  return null
}

/** Open the JSON health store. Throws if no directory can be resolved. */
export function openHealthStore(_readonly = false): HealthStore {
  const dir = resolveHealthDir()
  if (!dir) {
    throw new Error(
      'Health data directory could not be resolved (no SYLO_PERSONAL_DATA_DIR / SYLO_PERSONAL_DATA_ROOT / SYLO_USER_DIR) and no SYLO_DB_PATH/SYLO_HEALTH_DB_PATH to derive from. Run inside the Sylo broker with Health package enabled.',
    )
  }
  return new HealthStore(dir)
}