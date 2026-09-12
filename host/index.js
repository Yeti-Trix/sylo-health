// host-src/index.ts
import { cpSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readdirSync as readdirSync2, rmSync as rmSync2, statSync as statSync2 } from "node:fs";
import { dirname as dirname2, join as join2 } from "node:path";
import { fileURLToPath } from "node:url";

// shared/date-range.ts
var MAX_RANGE_DAYS = 93;
function resolveDateMs(date) {
  if (date === void 0 || date === null || date === "") return Date.now();
  if (typeof date === "number" && Number.isFinite(date)) return date;
  if (typeof date === "string" && date.trim()) {
    const iso = date.trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    }
    const parsed = Date.parse(iso);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}
function localDayBounds(dateMs = Date.now()) {
  const d = new Date(dateMs);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return { start, end: start + 864e5 - 1, date };
}
function resolveRangeBounds(args) {
  const hasStart = args.start_date != null && String(args.start_date).trim() !== "";
  const hasEnd = args.end_date != null && String(args.end_date).trim() !== "";
  const hasSingle = args.date != null && String(args.date).trim() !== "";
  if (hasStart || hasEnd) {
    const startBounds = localDayBounds(resolveDateMs(hasStart ? args.start_date : args.end_date));
    const endBounds = localDayBounds(resolveDateMs(hasEnd ? args.end_date : args.start_date));
    if (startBounds.start > endBounds.end) {
      throw new Error("start_date must be on or before end_date.");
    }
    const daySpan = (endBounds.start - startBounds.start) / 864e5 + 1;
    if (daySpan > MAX_RANGE_DAYS) {
      throw new Error(`Date range exceeds ${MAX_RANGE_DAYS} days. Narrow start_date/end_date.`);
    }
    return {
      start_ms: startBounds.start,
      end_ms: endBounds.end,
      start_date: startBounds.date,
      end_date: endBounds.date
    };
  }
  if (hasSingle) {
    const b = localDayBounds(resolveDateMs(args.date));
    return { start_ms: b.start, end_ms: b.end, start_date: b.date, end_date: b.date };
  }
  const today = localDayBounds(Date.now());
  return {
    start_ms: today.start,
    end_ms: today.end,
    start_date: today.date,
    end_date: today.date
  };
}
function resolveLoggedAt(args) {
  if (typeof args.logged_at === "number" && Number.isFinite(args.logged_at)) {
    return args.logged_at;
  }
  if (args.date != null && String(args.date).trim() !== "") {
    const { start } = localDayBounds(resolveDateMs(args.date));
    return start + 12 * 60 * 60 * 1e3;
  }
  return Date.now();
}
var LOCAL_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
function localDayOfWeekFromDate(dateYmd) {
  const { start } = localDayBounds(resolveDateMs(dateYmd));
  return LOCAL_DAY_NAMES[new Date(start).getDay()];
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatLocalLoggedAt(loggedAtMs) {
  const d = new Date(loggedAtMs);
  const logged_date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const logged_day_of_week = LOCAL_DAY_NAMES[d.getDay()];
  const logged_time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return {
    logged_at: loggedAtMs,
    logged_date,
    logged_day_of_week,
    logged_time,
    logged_datetime_local: `${logged_day_of_week} ${logged_date} ${logged_time}`
  };
}
function eachDayInRange(startMs, endMs) {
  const days = [];
  let cursor = localDayBounds(startMs).start;
  const last = localDayBounds(endMs).start;
  while (cursor <= last) {
    days.push(cursor);
    cursor += 864e5;
  }
  return days;
}

// shared/weight-units.ts
var KG_TO_LB = 2.2046226218;
function round1(n) {
  return Math.round(n * 10) / 10;
}
function kgToLb(kg) {
  return round1(kg * KG_TO_LB);
}
function lbToKg(lb) {
  return round1(lb / KG_TO_LB);
}
function validateWeightLb(lb) {
  if (!Number.isFinite(lb) || lb < 44 || lb > 1100) {
    return "weight_lb must be between 44 and 1100.";
  }
  return null;
}
function validateWeightKg(kg) {
  if (!Number.isFinite(kg) || kg < 20 || kg > 500) {
    return "weight_kg must be between 20 and 500.";
  }
  return null;
}
function resolveExerciseWeight(args) {
  const hasLb = typeof args.weight_lb === "number" && Number.isFinite(args.weight_lb);
  const hasKg = typeof args.weight_kg === "number" && Number.isFinite(args.weight_kg);
  if (!hasLb && !hasKg) return {};
  if (hasLb) {
    const weight_lb = round1(args.weight_lb);
    const err2 = validateWeightLb(weight_lb);
    if (err2) throw new Error(err2);
    return { weight_lb, weight_kg: lbToKg(weight_lb) };
  }
  const weight_kg = round1(args.weight_kg);
  const err = validateWeightKg(weight_kg);
  if (err) throw new Error(err);
  return { weight_lb: kgToLb(weight_kg), weight_kg };
}

// shared/health-store.ts
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
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
var LOG_SUBDIR = {
  meals: "meals",
  workouts: "workouts",
  weights: "weight",
  journal: "journal",
  garmin: "garmin"
};
function parseLogObjects(text) {
  const out = [];
  let skipped = 0;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          out.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          skipped++;
        }
        start = -1;
      }
    }
  }
  if (skipped > 0) {
    console.warn(`[sylo-health] skipped ${skipped} malformed NDJSON object(s) during load`);
  }
  return out;
}
function monthKeyFromLoggedAt(loggedAtMs) {
  return formatLocalLoggedAt(loggedAtMs).logged_date.slice(0, 7);
}
var HealthStore = class {
  dir;
  profile = null;
  meals = [];
  workouts = [];
  weights = [];
  journal = [];
  garmin = [];
  plans = [];
  constructor(dir) {
    this.dir = dir;
    this.load();
  }
  /** No database handle — nothing to release. Kept for the `withDb` close pattern. */
  close() {
  }
  // ---- load (read everything into memory once at open) ----
  load() {
    mkdirSync(this.dir, { recursive: true });
    this.profile = this.loadProfile();
    this.plans = this.loadPlans();
    this.meals = this.loadLogs("meals");
    this.workouts = this.loadLogs("workouts");
    this.weights = this.loadLogs("weights");
    this.journal = this.loadLogs("journal");
    this.garmin = this.loadLogs("garmin");
  }
  loadProfile() {
    const fp = join(this.dir, "profile.json");
    if (!existsSync(fp)) return null;
    try {
      return JSON.parse(readFileSync(fp, "utf8"));
    } catch {
      return null;
    }
  }
  loadPlans() {
    const pd = join(this.dir, "plans");
    if (!existsSync(pd)) return [];
    const out = [];
    for (const f of readdirSync(pd)) {
      if (!f.endsWith(".json")) continue;
      try {
        out.push(JSON.parse(readFileSync(join(pd, f), "utf8")));
      } catch {
      }
    }
    return out;
  }
  loadLogs(kind) {
    const sd = join(this.dir, LOG_SUBDIR[kind]);
    if (!existsSync(sd)) return [];
    const out = [];
    for (const f of readdirSync(sd)) {
      if (!f.endsWith(".ndjson") && !f.endsWith(".jsonl")) continue;
      const txt = readFileSync(join(sd, f), "utf8");
      out.push(...parseLogObjects(txt));
    }
    return out;
  }
  // ---- persist ----
  saveProfile() {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, "profile.json"), JSON.stringify(this.profile, null, 2) + "\n");
  }
  /** Append one entry as a single NDJSON line to its month file (insert path). */
  appendLog(kind, entry) {
    const sd = join(this.dir, LOG_SUBDIR[kind]);
    mkdirSync(sd, { recursive: true });
    const mk = monthKeyFromLoggedAt(entry.logged_at);
    const fp = join(sd, `${mk}.ndjson`);
    let prefix = "";
    if (existsSync(fp)) {
      const size = statSync(fp).size;
      if (size > 0) {
        const fd = openSync(fp, "r");
        try {
          const buf = Buffer.alloc(1);
          readSync(fd, buf, 0, 1, size - 1);
          if (buf[0] !== 10) prefix = "\n";
        } finally {
          closeSync(fd);
        }
      }
    }
    appendFileSync(fp, prefix + JSON.stringify(entry) + "\n");
  }
  /**
   * Rewrite a whole month file from the current in-memory entries of `kind`
   * that fall in `monthKey` (used by update/delete). Sorted by logged_at asc
   * for deterministic output. An empty month removes the file.
   */
  rewriteLogMonth(kind, monthKey) {
    const sd = join(this.dir, LOG_SUBDIR[kind]);
    mkdirSync(sd, { recursive: true });
    const fp = join(sd, `${monthKey}.ndjson`);
    const arr = this.collection(kind).filter((e) => monthKeyFromLoggedAt(e.logged_at) === monthKey).sort((a, b) => a.logged_at - b.logged_at);
    if (arr.length === 0) {
      if (existsSync(fp)) rmSync(fp);
      return;
    }
    writeFileSync(fp, arr.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
  /** Write one plan version to `plans/<id>.json`. */
  savePlan(plan) {
    const pd = join(this.dir, "plans");
    mkdirSync(pd, { recursive: true });
    writeFileSync(join(pd, `${plan.id}.json`), JSON.stringify(plan, null, 2) + "\n");
  }
  /** Remove a plan file (used when a version is deleted — currently unused but available). */
  deletePlanFile(id) {
    const fp = join(this.dir, "plans", `${id}.json`);
    if (existsSync(fp)) rmSync(fp);
  }
  collection(kind) {
    return kind === "meals" ? this.meals : kind === "workouts" ? this.workouts : kind === "weights" ? this.weights : kind === "garmin" ? this.garmin : this.journal;
  }
  /** Idempotent upsert of a Garmin daily row by `date`. Replaces an existing
   * row for the same calendar date or appends a new one, then rewrites the
   * month file. Re-pulling a day updates it in place (no duplicates). */
  upsertGarminDaily(row) {
    const idx = this.garmin.findIndex((e) => e.date === row.date);
    if (idx >= 0) this.garmin[idx] = row;
    else this.garmin.push(row);
    this.rewriteLogMonth("garmin", monthKeyFromLoggedAt(row.logged_at));
  }
};

// shared/nutrition-store.ts
function enrichMealLogEntry(entry) {
  const local = formatLocalLoggedAt(entry.logged_at);
  return {
    ...entry,
    logged_date: local.logged_date,
    logged_day_of_week: local.logged_day_of_week,
    logged_time: local.logged_time,
    logged_datetime_local: local.logged_datetime_local
  };
}
function enrichMealLogEntries(entries) {
  return entries.map(enrichMealLogEntry);
}
function round12(n) {
  return Math.round(n * 10) / 10;
}
function getHealthProfile(s) {
  return s.profile;
}
function listMealLogs(s, opts) {
  const from = opts?.from_ms ?? 0;
  const to = opts?.to_ms ?? Number.MAX_SAFE_INTEGER;
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100));
  return s.meals.filter((e) => e.logged_at >= from && e.logged_at <= to).sort((a, b) => b.logged_at - a.logged_at).slice(0, limit);
}
function aggregateDay(s, dateMs) {
  const { start, end } = localDayBounds(dateMs ?? Date.now());
  const dayEntries = s.meals.filter((e) => e.logged_at >= start && e.logged_at <= end);
  const consumed = dayEntries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein_g: round12(acc.protein_g + e.protein_g),
      carbs_g: round12(acc.carbs_g + e.carbs_g),
      fat_g: round12(acc.fat_g + e.fat_g)
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
  return { consumed, entry_count: dayEntries.length };
}
function buildDailySummary(s, dateMs) {
  const profile = getHealthProfile(s);
  if (!profile) return null;
  const bounds = localDayBounds(dateMs ?? Date.now());
  const { consumed, entry_count } = aggregateDay(s, dateMs);
  const targets = {
    calories: profile.daily_calorie_target,
    protein_g: profile.protein_g_target,
    carbs_g: profile.carbs_g_target,
    fat_g: profile.fat_g_target
  };
  return {
    date: bounds.date,
    day_of_week: localDayOfWeekFromDate(bounds.date),
    day_start_ms: bounds.start,
    day_end_ms: bounds.end,
    targets,
    consumed,
    remaining: {
      calories: targets.calories - consumed.calories,
      protein_g: round12(targets.protein_g - consumed.protein_g),
      carbs_g: round12(targets.carbs_g - consumed.carbs_g),
      fat_g: round12(targets.fat_g - consumed.fat_g)
    },
    entry_count
  };
}
function listMealLogsForRangeArg(s, args) {
  const range = resolveRangeBounds(args ?? {});
  return listMealLogs(s, {
    from_ms: range.start_ms,
    to_ms: range.end_ms,
    limit: args?.limit
  });
}
function buildDailySummaryForDateArg(s, date) {
  return buildDailySummary(s, resolveDateMs(date));
}
function buildDailySummariesForRangeArg(s, args) {
  const profile = getHealthProfile(s);
  if (!profile) return [];
  const range = resolveRangeBounds(args ?? {});
  const out = [];
  for (const dayMs of eachDayInRange(range.start_ms, range.end_ms)) {
    const summ = buildDailySummary(s, dayMs);
    if (summ) out.push(summ);
  }
  return out;
}

// shared/journal-store.ts
function enrichJournalEntry(entry) {
  const local = formatLocalLoggedAt(entry.logged_at);
  return {
    ...entry,
    logged_date: local.logged_date,
    logged_day_of_week: local.logged_day_of_week,
    logged_time: local.logged_time,
    logged_datetime_local: local.logged_datetime_local
  };
}
function enrichJournalEntries(entries) {
  return entries.map(enrichJournalEntry);
}
function listJournalEntries(s, opts) {
  const from = opts?.from_ms ?? 0;
  const to = opts?.to_ms ?? Number.MAX_SAFE_INTEGER;
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100));
  let rows = s.journal.filter((e) => e.logged_at >= from && e.logged_at <= to);
  if (opts?.active_only === true) rows = rows.filter((e) => e.active);
  return rows.sort((a, b) => b.logged_at - a.logged_at).slice(0, limit);
}
function listJournalForRangeArg(s, args) {
  const range = resolveRangeBounds(args ?? {});
  return listJournalEntries(s, {
    from_ms: range.start_ms,
    to_ms: range.end_ms,
    limit: args?.limit,
    active_only: args?.active_only
  });
}

// shared/workout-store.ts
import { randomUUID } from "node:crypto";

// shared/workout-constants.ts
var MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "cardio"
];
var MUSCLE_SET = new Set(MUSCLE_GROUPS);
function normalizeMuscleGroups(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const g = String(item ?? "").trim().toLowerCase();
    if (MUSCLE_SET.has(g) && !out.includes(g)) {
      out.push(g);
    }
  }
  return out;
}
function normalizeWorkoutStatus(raw, fallback = "completed") {
  const s = String(raw ?? fallback).trim().toLowerCase();
  if (s === "planned" || s === "skipped" || s === "completed") return s;
  return fallback;
}

// shared/workout-store.ts
function enrichWorkoutEntry(entry) {
  const local = formatLocalLoggedAt(entry.logged_at);
  return {
    ...entry,
    logged_date: local.logged_date,
    logged_day_of_week: local.logged_day_of_week,
    logged_time: local.logged_time,
    logged_datetime_local: local.logged_datetime_local
  };
}
function enrichWorkoutEntries(entries) {
  return entries.map(enrichWorkoutEntry);
}
function normalizeExercises(raw) {
  return raw.map((ex) => {
    const weights = resolveExerciseWeight({
      weight_lb: ex.weight_lb,
      weight_kg: ex.weight_kg
    });
    let setList;
    if (Array.isArray(ex.set_list)) {
      setList = ex.set_list.filter((s) => s != null && typeof s === "object").map((s) => {
        const roundLb = (v) => {
          if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return void 0;
          return Math.round(v * 10) / 10;
        };
        const weightLb = roundLb(s.weight_lb);
        const weightKg = weightLb != null ? Math.round(weightLb / 2.2046226218 * 100) / 100 : roundLb(s.weight_kg);
        return {
          done: s.done === true,
          weight_lb: weightLb,
          weight_kg: weightKg,
          reps: typeof s.reps === "number" && Number.isFinite(s.reps) ? Math.max(0, Math.floor(s.reps)) : void 0
        };
      });
    }
    const derivedSets = setList != null && setList.length > 0 ? setList.length : void 0;
    const setWeights = setList != null && setList.length > 0 ? setList.map((s) => s.weight_lb ?? 0).reduce((a, b) => Math.max(a, b), 0) : void 0;
    return {
      name: String(ex.name ?? "").trim() || "exercise",
      sets: ex.sets != null ? Math.floor(Number(ex.sets)) : derivedSets != null ? derivedSets : void 0,
      reps: ex.reps != null ? Math.floor(Number(ex.reps)) : void 0,
      ...weights,
      set_list: setList,
      // Keep the top-level weight meaningful when only per-set weights exist.
      ...setWeights != null && ex.weight_lb == null && ex.weight_kg == null && setWeights > 0 ? { weight_lb: setWeights, weight_kg: Math.round(setWeights * 0.45359237 * 100) / 100 } : {},
      duration_min: ex.duration_min != null ? Number(ex.duration_min) : void 0,
      notes: ex.notes != null ? String(ex.notes) : void 0,
      muscle_groups: ex.muscle_groups != null ? normalizeMuscleGroups(ex.muscle_groups) : void 0
    };
  });
}
function findPlannedWorkoutsOnDay(s, loggedAt) {
  const { start, end } = localDayBounds(loggedAt);
  return listWorkoutLogs(s, { from_ms: start, to_ms: end, status: "planned", limit: 10 });
}
function insertWorkoutLog(s, args) {
  const loggedAt = resolveLoggedAt({ date: args.date, logged_at: args.logged_at });
  const exercises = normalizeExercises(args.exercises ?? []);
  const status = normalizeWorkoutStatus(args.status);
  if (status === "completed") {
    const planned = findPlannedWorkoutsOnDay(s, loggedAt);
    if (planned.length >= 1) {
      const target = planned[0];
      const entry2 = updateWorkoutLog(s, target.id, {
        title: args.title.trim() || target.title,
        description: args.description !== void 0 ? args.description : target.description,
        duration_min: args.duration_min !== void 0 ? args.duration_min : target.duration_min,
        calories_burned: args.calories_burned !== void 0 ? args.calories_burned : target.calories_burned,
        exercises: args.exercises !== void 0 ? exercises : target.exercises,
        notes: args.notes !== void 0 ? args.notes : target.notes,
        status: "completed",
        logged_at: loggedAt
      });
      return { entry: entry2, replaced_planned: true };
    }
  }
  const now = Date.now();
  const id = randomUUID();
  const entry = {
    id,
    logged_at: loggedAt,
    title: args.title.trim() || "Workout",
    description: args.description ?? null,
    duration_min: args.duration_min ?? null,
    calories_burned: args.calories_burned ?? null,
    exercises,
    notes: args.notes ?? null,
    status,
    updated_at: now
  };
  s.workouts.push(entry);
  s.appendLog("workouts", entry);
  return { entry, replaced_planned: false };
}
function getWorkoutById(s, id) {
  return s.workouts.find((e) => e.id === id) ?? null;
}
function updateWorkoutLog(s, id, patch) {
  const existing = getWorkoutById(s, id);
  if (!existing) return null;
  const oldMonth = monthKeyFromLoggedAt(existing.logged_at);
  const now = Date.now();
  let loggedAt = existing.logged_at;
  if (patch.logged_at !== void 0 || patch.date !== void 0) {
    loggedAt = resolveLoggedAt({ date: patch.date, logged_at: patch.logged_at });
  }
  const exercises = patch.exercises != null ? normalizeExercises(patch.exercises) : existing.exercises;
  const status = patch.status != null ? normalizeWorkoutStatus(patch.status) : existing.status;
  const merged = {
    ...existing,
    title: patch.title?.trim() || existing.title,
    description: patch.description !== void 0 ? patch.description : existing.description,
    duration_min: patch.duration_min !== void 0 ? patch.duration_min : existing.duration_min,
    calories_burned: patch.calories_burned !== void 0 ? patch.calories_burned : existing.calories_burned,
    exercises,
    notes: patch.notes !== void 0 ? patch.notes : existing.notes,
    status,
    logged_at: loggedAt,
    updated_at: now
  };
  const idx = s.workouts.findIndex((e) => e.id === id);
  s.workouts[idx] = merged;
  const newMonth = monthKeyFromLoggedAt(merged.logged_at);
  s.rewriteLogMonth("workouts", oldMonth);
  if (newMonth !== oldMonth) s.rewriteLogMonth("workouts", newMonth);
  return merged;
}
function deleteWorkoutLog(s, id) {
  const existing = getWorkoutById(s, id);
  if (!existing) return false;
  const oldMonth = monthKeyFromLoggedAt(existing.logged_at);
  s.workouts = s.workouts.filter((e) => e.id !== id);
  s.rewriteLogMonth("workouts", oldMonth);
  return true;
}
function listWorkoutLogs(s, opts) {
  const from = opts?.from_ms ?? 0;
  const to = opts?.to_ms ?? Number.MAX_SAFE_INTEGER;
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100));
  let rows = s.workouts.filter((e) => e.logged_at >= from && e.logged_at <= to);
  if (opts?.status != null && String(opts.status).trim() !== "") {
    const st = normalizeWorkoutStatus(opts.status);
    rows = rows.filter((e) => e.status === st);
  }
  return rows.sort((a, b) => b.logged_at - a.logged_at).slice(0, limit);
}
function listWorkoutsForRangeArg(s, args) {
  const range = resolveRangeBounds(args ?? {});
  return listWorkoutLogs(s, {
    from_ms: range.start_ms,
    to_ms: range.end_ms,
    limit: args?.limit,
    status: args?.status
  });
}
function buildWorkoutRangeSummary(s, args) {
  const range = resolveRangeBounds(args ?? {});
  const entries = listWorkoutsForRangeArg(s, { ...args, limit: args?.limit ?? 500 });
  let total_duration_min = 0;
  let total_calories_burned = 0;
  let completed_count = 0;
  let planned_count = 0;
  let skipped_count = 0;
  for (const e of entries) {
    if (e.status === "completed") completed_count += 1;
    else if (e.status === "planned") planned_count += 1;
    else if (e.status === "skipped") skipped_count += 1;
    if (e.duration_min != null) total_duration_min += e.duration_min;
    if (e.calories_burned != null) total_calories_burned += e.calories_burned;
  }
  return {
    start_date: range.start_date,
    end_date: range.end_date,
    workout_count: entries.length,
    completed_count,
    planned_count,
    skipped_count,
    total_duration_min,
    total_calories_burned,
    entries
  };
}
function searchExerciseHistory(s, args) {
  const term = String(args.name ?? "").trim().toLowerCase();
  if (!term) return [];
  const limit = Math.min(100, Math.max(1, args.limit ?? 20));
  const hits = [];
  const ordered = [...s.workouts].sort((a, b) => b.logged_at - a.logged_at);
  for (const w of ordered) {
    for (const rawEx of w.exercises) {
      const name = String(rawEx.name ?? "").toLowerCase();
      if (name.includes(term)) {
        const exercise = normalizeExercises([rawEx])[0];
        const local = formatLocalLoggedAt(w.logged_at);
        hits.push({
          workout_id: w.id,
          workout_title: w.title,
          workout_status: w.status,
          logged_at: w.logged_at,
          logged_date: local.logged_date,
          logged_day_of_week: local.logged_day_of_week,
          logged_datetime_local: local.logged_datetime_local,
          exercise
        });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}
function buildMuscleSummary(s, args) {
  const range = resolveRangeBounds(args ?? {});
  const allowedStatuses = args?.include_planned === true ? /* @__PURE__ */ new Set(["completed", "planned"]) : /* @__PURE__ */ new Set(["completed"]);
  const rows = s.workouts.filter(
    (e) => e.logged_at >= range.start_ms && e.logged_at <= range.end_ms && allowedStatuses.has(e.status)
  );
  const agg = /* @__PURE__ */ new Map();
  for (const w of rows) {
    const exercises = normalizeExercises(w.exercises);
    const sessionGroups = /* @__PURE__ */ new Set();
    for (const ex of exercises) {
      const groups2 = ex.muscle_groups ?? [];
      const sets = ex.sets ?? 1;
      const reps = ex.reps ?? 0;
      const weight = ex.weight_kg ?? 0;
      const volume = sets * reps * weight;
      for (const g of groups2) {
        sessionGroups.add(g);
        const cur = agg.get(g) ?? {
          muscle_group: g,
          session_count: 0,
          set_count: 0,
          rep_count: 0,
          volume_kg: 0
        };
        cur.set_count += sets;
        cur.rep_count += sets * reps;
        cur.volume_kg = Math.round((cur.volume_kg + volume) * 10) / 10;
        agg.set(g, cur);
      }
    }
    for (const g of sessionGroups) {
      const cur = agg.get(g);
      cur.session_count += 1;
      agg.set(g, cur);
    }
  }
  const groups = [...agg.values()].sort((a, b) => a.muscle_group.localeCompare(b.muscle_group));
  return {
    start_date: range.start_date,
    end_date: range.end_date,
    groups
  };
}

// shared/weight-store.ts
function enrichWeightEntry(entry) {
  const local = formatLocalLoggedAt(entry.logged_at);
  return {
    ...entry,
    logged_date: local.logged_date,
    logged_day_of_week: local.logged_day_of_week,
    logged_time: local.logged_time,
    logged_datetime_local: local.logged_datetime_local
  };
}
function enrichWeightEntries(entries) {
  return entries.map(enrichWeightEntry);
}
function getLatestWeightEntry(s) {
  if (s.weights.length === 0) return null;
  return s.weights.reduce((best, e) => e.logged_at > best.logged_at ? e : best, s.weights[0]);
}
function listWeightLogs(s, opts) {
  const from = opts?.from_ms ?? 0;
  const to = opts?.to_ms ?? Number.MAX_SAFE_INTEGER;
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100));
  return s.weights.filter((e) => e.logged_at >= from && e.logged_at <= to).sort((a, b) => b.logged_at - a.logged_at).slice(0, limit);
}
function listWeightsForRangeArg(s, args) {
  const range = resolveRangeBounds(args ?? {});
  return listWeightLogs(s, {
    from_ms: range.start_ms,
    to_ms: range.end_ms,
    limit: args?.limit
  });
}
function buildWeightRangeSummary(s, args) {
  const range = resolveRangeBounds(args ?? {});
  const entries = listWeightsForRangeArg(s, { ...args, limit: args?.limit ?? 500 });
  const profile = getHealthProfile(s);
  const latest = getLatestWeightEntry(s);
  const chronological = [...entries].sort((a, b) => a.logged_at - b.logged_at);
  const first = chronological[0];
  const last = chronological[chronological.length - 1];
  const change_kg = first && last && first.id !== last.id ? round1(last.weight_kg - first.weight_kg) : 0;
  const change_lb = first && last && first.id !== last.id ? round1(last.weight_lb - first.weight_lb) : 0;
  return {
    start_date: range.start_date,
    end_date: range.end_date,
    entry_count: entries.length,
    latest_weight_lb: latest?.weight_lb ?? (latest ? kgToLb(latest.weight_kg) : null),
    latest_weight_kg: latest?.weight_kg ?? profile?.weight_kg ?? null,
    target_weight_lb: profile?.target_weight_lb ?? null,
    target_weight_kg: profile?.target_weight_kg ?? null,
    change_lb,
    change_kg,
    entries
  };
}

// shared/plan-store.ts
function enrichPlan(plan) {
  const local = formatLocalLoggedAt(plan.created_at);
  return {
    ...plan,
    created_date: local.logged_date,
    created_datetime_local: local.logged_datetime_local
  };
}
function enrichPlans(plans) {
  return plans.map(enrichPlan);
}
function getActivePlan(s) {
  const active = s.plans.filter((p) => p.status === "active").sort((a, b) => b.created_at - a.created_at);
  return active[0] ?? null;
}
function listWorkoutPlans(s, opts) {
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 20));
  return [...s.plans].sort((a, b) => b.created_at - a.created_at).slice(0, limit);
}

// host-src/health-db.ts
function createHealthDb(dataDir) {
  function store() {
    return new HealthStore(dataDir());
  }
  return {
    healthProfileGet() {
      return getHealthProfile(store());
    },
    healthDailySummary(date) {
      return buildDailySummaryForDateArg(store(), date);
    },
    healthDailySummaries(args) {
      return buildDailySummariesForRangeArg(store(), args ?? {});
    },
    healthLogList(args) {
      const entries = listMealLogsForRangeArg(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        limit: args?.limit
      });
      return enrichMealLogEntries(entries);
    },
    healthWorkoutList(args) {
      const entries = listWorkoutsForRangeArg(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        limit: args?.limit,
        status: args?.status
      });
      return enrichWorkoutEntries(entries);
    },
    healthWorkoutSummary(args) {
      const summary = buildWorkoutRangeSummary(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        limit: args?.limit,
        status: args?.status
      });
      return {
        ...summary,
        entries: enrichWorkoutEntries(summary.entries)
      };
    },
    healthExerciseHistory(args) {
      const name = String(args?.name ?? "").trim();
      if (!name) return [];
      return searchExerciseHistory(store(), {
        name,
        limit: args?.limit
      });
    },
    healthWorkoutLog(args) {
      const result = insertWorkoutLog(store(), {
        title: typeof args?.title === "string" ? args.title : "",
        description: typeof args?.description === "string" ? args.description : void 0,
        duration_min: typeof args?.duration_min === "number" ? args.duration_min : void 0,
        calories_burned: typeof args?.calories_burned === "number" ? args.calories_burned : void 0,
        exercises: Array.isArray(args?.exercises) ? args.exercises : void 0,
        notes: typeof args?.notes === "string" ? args.notes : void 0,
        status: typeof args?.status === "string" ? args.status : void 0,
        date: args?.date,
        logged_at: args?.logged_at
      });
      return {
        entry: result.entry ? enrichWorkoutEntry(result.entry) : null,
        replaced_planned: result.replaced_planned
      };
    },
    healthWorkoutUpdate(args) {
      const id = typeof args?.id === "string" ? args.id : "";
      if (!id) throw new Error("missing_id");
      const patch = {};
      if (typeof args?.title === "string") patch.title = args.title;
      if (typeof args?.description === "string") patch.description = args.description;
      if (args?.duration_min !== void 0)
        patch.duration_min = typeof args.duration_min === "number" ? args.duration_min : null;
      if (args?.calories_burned !== void 0)
        patch.calories_burned = typeof args.calories_burned === "number" ? args.calories_burned : null;
      if (Array.isArray(args?.exercises)) patch.exercises = args.exercises;
      if (args?.notes !== void 0)
        patch.notes = typeof args.notes === "string" ? args.notes : null;
      if (typeof args?.status === "string") patch.status = args.status;
      if (args?.date !== void 0) patch.date = args.date;
      if (args?.logged_at !== void 0) patch.logged_at = args.logged_at;
      const updated = updateWorkoutLog(store(), id, patch);
      if (!updated) throw new Error("workout_not_found");
      return enrichWorkoutEntry(updated);
    },
    healthWorkoutDelete(args) {
      const id = typeof args?.id === "string" ? args.id : "";
      if (!id) throw new Error("missing_id");
      const ok = deleteWorkoutLog(store(), id);
      if (!ok) throw new Error("workout_not_found");
      return { ok: true };
    },
    healthWorkoutGet(args) {
      const id = typeof args?.id === "string" ? args.id : "";
      if (!id) throw new Error("missing_id");
      const entry = getWorkoutById(store(), id);
      return entry ? enrichWorkoutEntry(entry) : null;
    },
    healthMuscleSummary(args) {
      return buildMuscleSummary(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        include_planned: args?.include_planned === true
      });
    },
    healthWeightList(args) {
      const entries = listWeightsForRangeArg(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        limit: args?.limit
      });
      return enrichWeightEntries(entries);
    },
    healthWeightSummary(args) {
      const summary = buildWeightRangeSummary(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        limit: args?.limit
      });
      return {
        ...summary,
        entries: enrichWeightEntries(summary.entries)
      };
    },
    healthPlanActive() {
      const plan = getActivePlan(store());
      return plan ? enrichPlan(plan) : null;
    },
    healthPlanList(args) {
      return enrichPlans(listWorkoutPlans(store(), { limit: args?.limit }));
    },
    healthJournalList(args) {
      const entries = listJournalForRangeArg(store(), {
        date: args?.date,
        start_date: args?.start_date,
        end_date: args?.end_date,
        limit: args?.limit
      });
      return enrichJournalEntries(entries);
    }
  };
}

// host-src/index.ts
var PLUGIN_OPS = [
  "healthProfileGet",
  "healthDailySummary",
  "healthDailySummaries",
  "healthLogList",
  "healthWorkoutList",
  "healthWorkoutSummary",
  "healthExerciseHistory",
  "healthMuscleSummary",
  "healthWeightList",
  "healthWeightSummary",
  "healthJournalList",
  "healthPlanActive",
  "healthPlanList",
  "healthWorkoutGet",
  "healthWorkoutLog",
  "healthWorkoutUpdate",
  "healthWorkoutDelete"
];
var SETTINGS_CARD = {
  title: "Health data",
  lead: "Health logs (meals, workouts, weight, journal, Garmin) are git-synced JSON. By default they live in sylo-user/health \u2014 the operator-private universal workspace. Set an explicit override below only for exceptions.",
  prefKey: "sylo.personal.data_dir",
  defaultLabel: "Using default: sylo-user/health.",
  valuePrefix: "Health data directory: ",
  pickLabel: "Choose health data folder\u2026",
  restartBrokerOnSave: true
};
var COMPANION_MANIFEST = {
  tabs: [
    { id: "nutrition", label: "Nutrition", icon: "utensils" },
    { id: "workout", label: "Workout", icon: "dumbbell" },
    { id: "vitals", label: "Vitals", icon: "activity" }
  ],
  appBase: "/personal-app/index.html",
  landing: {
    op: "healthWorkoutList",
    payload: { date: "$today", limit: 20 },
    title: "Today's workout",
    singleLabel: "Workout",
    countNoun: "workouts"
  }
};
function syncBuiltHealthApp(builtDir, serveDir) {
  try {
    if (!existsSync2(join2(builtDir, "index.html"))) return;
    mkdirSync2(serveDir, { recursive: true });
    cpSync(join2(builtDir, "index.html"), join2(serveDir, "index.html"));
    const fallbackSrc = join2(builtDir, "fallback.md");
    if (existsSync2(fallbackSrc)) cpSync(fallbackSrc, join2(serveDir, "fallback.md"));
    const srcAssets = join2(builtDir, "assets");
    const dstAssets = join2(serveDir, "assets");
    if (existsSync2(srcAssets)) {
      mkdirSync2(dstAssets, { recursive: true });
      for (const name of readdirSync2(srcAssets)) {
        if (statSync2(join2(srcAssets, name)).isFile()) {
          cpSync(join2(srcAssets, name), join2(dstAssets, name));
        }
      }
      for (const name of readdirSync2(dstAssets)) {
        if (!existsSync2(join2(srcAssets, name))) {
          try {
            rmSync2(join2(dstAssets, name), { force: true });
          } catch {
          }
        }
      }
    }
  } catch (err) {
    console.warn("[sylo-health] health-app asset sync failed:", err);
  }
}
function createPersonalPlugin(di) {
  const dataDir = () => di.dataDirOverride() ?? join2(di.dataRoot(), "health");
  try {
    mkdirSync2(dataDir(), { recursive: true });
  } catch {
  }
  syncBuiltHealthApp(join2(dirname2(dirname2(fileURLToPath(import.meta.url))), "skills", "nutrition", "routes", "health"), join2(di.hostAgentDir(), "skills", "nutrition", "routes", "health"));
  di.setPersonalAppRoot(() => join2(di.hostAgentDir(), "skills", "nutrition", "routes", "health"));
  const db = createHealthDb(dataDir);
  function rpc(op, payload) {
    const name = String(op ?? "").trim();
    const args = payload ?? {};
    switch (name) {
      case "healthProfileGet":
        return db.healthProfileGet();
      case "healthDailySummary":
        return db.healthDailySummary(args.date);
      case "healthDailySummaries":
        return db.healthDailySummaries(args);
      case "healthLogList":
        return db.healthLogList(args);
      case "healthWorkoutList":
        return db.healthWorkoutList(args);
      case "healthWorkoutSummary":
        return db.healthWorkoutSummary(args);
      case "healthExerciseHistory":
        return db.healthExerciseHistory(args);
      case "healthMuscleSummary":
        return db.healthMuscleSummary(args);
      case "healthWeightList":
        return db.healthWeightList(args);
      case "healthWeightSummary":
        return db.healthWeightSummary(args);
      case "healthJournalList":
        return db.healthJournalList(args);
      case "healthPlanActive":
        return db.healthPlanActive();
      case "healthPlanList":
        return db.healthPlanList({ limit: typeof args.limit === "number" ? args.limit : void 0 });
      case "healthWorkoutGet":
        return db.healthWorkoutGet(args);
      case "healthWorkoutLog":
        return db.healthWorkoutLog(args);
      case "healthWorkoutUpdate":
        return db.healthWorkoutUpdate(args);
      case "healthWorkoutDelete":
        return db.healthWorkoutDelete(args);
      default:
        throw new Error("unknown_op");
    }
  }
  return {
    ops: [...PLUGIN_OPS],
    settingsCard: () => SETTINGS_CARD,
    companionManifest: () => COMPANION_MANIFEST,
    rpc
  };
}
export {
  PLUGIN_OPS,
  createPersonalPlugin,
  syncBuiltHealthApp
};
