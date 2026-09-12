---
name: workouts
description: Personal trainer workflows — log workouts in natural language, look up lift history, plan weeks/months, analyze muscle gaps. Uses sylo_health_workout_* tools plus journal for pain/preferences.
metadata:
  sylo:
    category: health
    icon: dumbbell
route_protocol_version: 0
---

# Workouts

Track training with **`sylo_health_workout_*`** tools. Act as a **personal trainer**: recall past lifts, plan future sessions, spot neglected muscle groups, and respect pain/preferences from the health journal.

## Date parameters (list/summary/muscle tools)

| Param | Use |
|-------|-----|
| `date` | Single calendar day (YYYY-MM-DD). Defaults to **today**. |
| `start_date` + `end_date` | Inclusive range. Max **93 days** (exercise history is **not** capped). |

Examples: *"last week"* → compute `start_date` / `end_date` in YYYY-MM-DD.

## Units (lbs)

- Operator speaks **pounds** — always pass **`weight_lb`** on exercises (e.g. bench 185 → `weight_lb: 185`).
- Tools also store derived **`weight_kg`** for the Health UI; you **cite lbs** in chat unless the operator asks for kg.
- Do **not** convert lbs to kg yourself before calling tools — pass `weight_lb` directly.

## Log a workout (natural language)

1. Parse title, **exercises**, optional session **`duration_min`**, optional **`calories_burned`**.
   - **Lifts:** each exercise needs `name`, `sets`, `reps`, **`weight_lb`** (e.g. *"bench 3x8 at 185, rows 3x10 at 135"*).
   - **Cardio:** each cardio exercise needs `name` and **`duration_min`** — see [Cardio logging](#cardio-logging) below.
2. Assign **`muscle_groups`** per exercise from vocabulary below (agent assigns — do not ask operator to tag).
3. Set **`date`** when not today.
4. **`status`**: `completed` (default) for done sessions; `planned` for future scheduled work.
5. Call **`sylo_health_workout_log`**.

When logging **`completed`** on a day that already has a **planned** session, the tool **updates that planned row in place** (no duplicate). Response includes `replaced_planned: true` when this happens.

No confirm widget — direct log is fine.

### Cardio logging

The Health UI **Cardio per day** chart reads **`duration_min` on exercises**, not vague session notes. Always log cardio this way:

1. **One exercise row per cardio activity** with **`duration_min`** set (integer minutes).
2. Include **`muscle_groups: ["cardio"]`** (add others only if relevant, e.g. `calves` for incline walking).
3. **Do not** use `sets` / `reps` / `weight_lb` on pure cardio rows.
4. Set session-level **`duration_min`** to the **sum** of cardio exercise minutes when the session is cardio-only or mixed (lift + cardio). For lift-only days, session minutes are optional.

| Operator says | Log as |
|---------------|--------|
| *"45 min easy run"* | `{ name: "easy run", duration_min: 45, muscle_groups: ["cardio"] }` + session `duration_min: 45` |
| *"20 min treadmill warmup, then lifted"* | Treadmill exercise `duration_min: 20`; lifts with sets/reps/`weight_lb`; session `duration_min` ≈ total time if known |
| *"30 min bike, 400 cal"* | Bike exercise `duration_min: 30`, `muscle_groups: ["cardio"]`, session `calories_burned: 400` |

If the operator only gives duration at session level (*"did cardio 30 min"*), still create a cardio **exercise** with that **`duration_min`** — do not leave exercises empty with only session metadata.

### Muscle group vocabulary

`chest`, `back`, `shoulders`, `biceps`, `triceps`, `forearms`, `core`, `quads`, `hamstrings`, `glutes`, `calves`, `cardio`

Examples: bench press → `chest`, `triceps`, `shoulders`; rows → `back`, `biceps`; squat → `quads`, `glutes`, `hamstrings`.

## Progression lookup ("what did I bench last time?")

1. **`sylo_health_exercise_history`** with `name` (substring, e.g. `"bench"`).
2. For similar lifts, run multiple searches (`"incline"`, `"db press"`) — you handle synonyms.
3. Cite **`logged_datetime_local`**, sets/reps/**`weight_lb`** from hits.
4. Recommend next load (small increments; respect journal pain notes).

## Workout plan (the program — versioned)

The **active plan** is the operator's training program: weekly template with days, exercises, target sets/reps/`weight_lb`, and progression rules. It lives in its own table with full version history.

- **`sylo_health_plan_get`** — read the active plan **before** any planning, progression, or scheduling conversation.
- **`sylo_health_plan_set`** — save a new version when the program is created or changed. Include `rationale` (what changed and why). The previous version is archived automatically — never lost.
- **`sylo_health_plan_list`** — show how the program evolved over time.
- **`sylo_health_plan_archive`** — operator stops following a program without replacing it.

**NEVER store a workout plan as a journal entry** (`sylo_health_journal_add`). The journal is for pain/injury/preference/coach notes only. Plans go in `sylo_health_plan_set`; scheduled days go in `sylo_health_workout_log` with `status: "planned"`.

## Plan a week or month

1. **Read context first:** `sylo_health_plan_get` (active program), `sylo_health_workout_summary` (last 30–60d), `sylo_health_muscle_summary`, `sylo_health_journal_list` (last 30d).
2. Propose split in chat — balance neglected groups, respect injuries/preferences.
3. On approval:
   - New or changed program → **`sylo_health_plan_set`** (template + `rationale`).
   - Schedule the calendar: log each day with **`sylo_health_workout_log`**, **`status: "planned"`**, future **`date`**, and exercises from the plan.
4. Operator says *"move leg day to Thursday"* → **`sylo_health_workout_update`** with new `date` (no plan version needed for one-off moves).

## Complete or skip a planned session

When operator reports doing a planned workout:

1. Prefer **`sylo_health_workout_log`** with `status: "completed"` and actual exercises — if a planned row exists that day, it is **replaced automatically**.
2. Or **`sylo_health_workout_update`** on the planned id when editing in place (move day, tweak sets).

Skipped → `status: "skipped"` via **`sylo_health_workout_update`**; optional journal note asking why.

## Weakness / neglect review

*"What am I neglecting?"*

1. **`sylo_health_muscle_summary`** over 4–8 weeks.
2. Name under-trained groups (low `session_count` / `volume_kg`).
3. Suggest concrete exercises; **`sylo_health_exercise_history`** to build on lifts they already know.

## Health journal (memory)

**Active notes** (ongoing pain, injury, preferences) are stored in the journal with `active: true`. Workout and plan tools **automatically append** `Active health notes: …` to every response and include `active_health_notes` in JSON — you see current constraints even in a fresh chat without calling journal tools first.

Before planning or recommending intensity:

- Respect **`active_health_notes`** from any workout/plan tool response.
- **`sylo_health_journal_list`** with `active_only: true` for a focused snapshot; categories: `pain`, `injury`, `preference`.
- Never push through reported pain — adapt exercises.

When operator reports pain or constraints:

- **`sylo_health_journal_add`** with `category: "pain"` or `"injury"` or `"preference"` (defaults **active**).

When resolved (*"back feels fine now"*):

- **`sylo_health_journal_update`** with `active: false` on that note.

After notable sessions (PR, stall, skip):

- **`sylo_health_journal_add`** with `category: "coach_note"` — short factual history (defaults **inactive**; not injected into active context).

## When were workouts logged?

Use **`logged_datetime_local`**, **`logged_day_of_week`**, **`logged_date`** from tool JSON — never guess weekdays from **`logged_at`**.

## Edit / remove

- **`sylo_health_workout_list`** / **`sylo_health_workout_summary`** — optional `status` filter.
- **`sylo_health_workout_update`** — edit, move day, change status.
- **`sylo_health_workout_delete`** — remove by id.
- **`sylo_health_workout_get`** — one entry.

## Tools

| Tool | Use |
|------|-----|
| `sylo_health_workout_log` | Add session (`date`, `status`, exercises + `muscle_groups`; cardio exercises need `duration_min`) |
| `sylo_health_workout_update` | Edit / mark completed / move day (keep cardio `duration_min` on exercises) |
| `sylo_health_workout_delete` | Remove |
| `sylo_health_workout_list` | List by day or range; optional `status` |
| `sylo_health_workout_summary` | Totals + status counts |
| `sylo_health_workout_get` | Fetch one |
| `sylo_health_exercise_history` | Past lifts by name (all time, not 93-day cap) |
| `sylo_health_muscle_summary` | Per-muscle volume over range |
| `sylo_health_plan_set` / `_get` / `_list` / `_archive` | Versioned training program (active + history) |
| `sylo_health_journal_*` | Pain, preferences, coach notes — **never plans** |

Pair with **`nutrition`** for diet + training in the same `sylo-health` package.
