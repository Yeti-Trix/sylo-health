---
name: nutrition
description: Set health profile and daily calorie targets, log meals (text or photo), and suggest foods that fit remaining macros. Uses sylo_health_* tools; looks up restaurant items via web search (prefers sylo-web-access when enabled).
metadata:
  sylo:
    category: health
    icon: apple
widgets:
  - log-meal-confirm
widget_protocol_version: 1
routes:
  - id: health
    title: Health
    icon: chart
    nav_section: domain
    entry: routes/health/index.html
    fallback: routes/health/fallback.md
route_protocol_version: 0
---

# Nutrition

Personal meal logging and macro tracking. This skill owns **`sylo_health_*`** persistence only. Web lookups for restaurant/branded nutrition follow the priority below.

## Web lookup priority (restaurant / branded items)

1. **`sylo-web-access`** — if enabled, use **`sylo_web_search`** / **`sylo_web_fetch`** first.
2. **Other web tools** — any other search/fetch tools loaded in this session.
3. **No web tools** — use your best estimate from training knowledge, set `warn_guess: true` in the confirm widget data, and **explicitly warn** the operator that you are guessing.

Prefer official menu or nutrition pages. Do not rely on USDA reference data for cooked/restaurant/branded items. Example queries:

- `"Wendy's spicy chicken sandwich calories site:wendys.com OR nutrition"`
- `"Chipotle chicken bowl nutrition facts official"`
- `"McDonald's Big Mac calories protein site:mcdonalds.com"`

Cite the page or source in `lookup_note` when you used web lookup.

## Before logging

1. If no profile exists, run **`sylo_health_profile_set`** (height cm, **`weight_lb`**, age, sex, activity, **`target_weight_lb`**). Cite **lbs** in chat; UI shows lb · kg.
2. Use **`sylo_health_profile_get`** to show the operator their daily calorie and macro targets.
3. When the operator mentions weight, log it with **`sylo_health_weight_log`** (any day via **`date`**) — do not only update the profile; history matters for the Vitals tab and weekly coaching.

## Logging a meal (text or photo)

### Parse

1. **Text** — parse what was eaten; for restaurant or branded items, follow **web lookup priority** above.
2. **Photo** — use the operator's vision model on the attachment. Identify foods and estimate portions. If serving size, brand, or quantity is unclear, **ask one clarifying question** before proposing macros (e.g. "Was that the full sandwich or half?").
3. Build decomposed line items (`name`, optional `serving`, `calories`, `protein_g`, `carbs_g`, `fat_g`) plus meal totals.

Set `source` on save: `operator_text`, `operator_photo`, or `agent_estimate` (model guess without web).

### Confirm (required)

Do **not** call **`sylo_health_log_meal`** until the operator confirms.

**Preferred (Sylo host with widgets):** call **`show_widget`** with:

```json
{
  "path": "/skill-surface/widgets/nutrition/widget.html",
  "data": {
    "description": "Wendy's spicy chicken sandwich",
    "items": [ { "name": "...", "serving": "1 sandwich", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 } ],
    "source": "operator_text",
    "lookup_note": "wendys.com nutrition page",
    "warn_guess": false,
    "calories": 0,
    "protein_g": 0,
    "carbs_g": 0,
    "fat_g": 0
  }
}
```

When the widget **`sendToAgent`** payload has `"action": "confirm"`, call **`sylo_health_log_meal`** with those fields. On `"action": "cancel"`, do not save; ask what to change.

**Fallback (no widget):** summarize items and totals in chat, warn on guess, wait for explicit yes/no — see `assets/widgets/log-meal-confirm/fallback.md`.

Macros are **estimates only** — say so when home-cooked, vague portions, or step 3 (no web tools) applied.

## What can I eat today?

1. **`sylo_health_remaining_macros`** for today.
2. Suggest realistic options that fit remaining calories and protein/carbs/fat. Use the same **web lookup priority** when suggesting specific restaurant items.
3. Before suggesting meals, skim **`sylo_health_journal_list`** (recent week) for injuries, pain, cravings, or preferences the operator mentioned — adapt advice (e.g. anti-inflammatory options, softer foods when back hurts, lower sodium if they said bloating).

## Weekly coaching (calories + goal weight)

You are an ongoing coach, not a one-shot logger. On check-ins or when the operator asks how they are doing:

1. **`sylo_health_daily_summaries`** for the **last 7 days** — compare average consumed calories vs **`daily_calorie_target`**.
2. **`sylo_health_weight_summary`** for the same week — trend vs **`target_weight_lb`** / goal.
3. **Call out patterns** — days well over target, days under (risk of undereating), low protein days, missed logging.
4. **Adjust targets when warranted** — if weight trend stalls for 2+ weeks *and* adherence was good, use **`sylo_health_profile_set`** with updated **`weight_lb`** (from latest weigh-in) and optionally **`target_weeks`**; explain the new calorie target in plain language.
5. **Meal advice** — when over target, suggest lighter next meals; when under (especially protein), suggest additions. Use **web lookup priority** for concrete menu ideas when they name restaurants or cuisines.
6. **Do not nag** on a single bad day; focus on weekly averages and sustainable pace toward goal weight.

## Health journal (context history)

Operators mention transient context — sore back, travel, stress, food preferences. **Persist it** so future sessions remember:

- **`sylo_health_journal_add`** when they share anything that should influence meals, workouts, or targets (pain, injury, mood, schedule, preferences).
- **Never store workout plans/programs in the journal** — those belong in `sylo_health_plan_set` (workouts skill) + planned workout entries.
- **`sylo_health_journal_list`** at the start of coaching or meal-planning threads (last 7–30 days).
- **`sylo_health_journal_update`** / **`sylo_health_journal_delete`** when they correct or retract a note.

Use optional **`category`** tags: `pain`, `injury`, `mood`, `preference`, `schedule`, `general`.

## Weight (Vitals tab)

Tell the agent your weight in chat — it logs history, not just a profile snapshot.

- **`sylo_health_weight_log`** — pass **`weight_lb`** (pounds) and optional **`date`** for any day. Cite **lbs** in chat; UI shows lb · kg.
- **`sylo_health_weight_list`** / **`sylo_health_weight_summary`** — history and trends (like meals/workouts).
- **`sylo_health_weight_update`** / **`sylo_health_weight_delete`** — corrections.

Latest weigh-in **automatically updates** profile weight and recalculates calorie targets. Initial setup still uses **`sylo_health_profile_set`**.

## Any day — not only today

- **`sylo_health_log_meal`** — pass **`date`** (YYYY-MM-DD) to log meals on past or future days.
- **`sylo_health_log_update`** — change entries or move them with **`date`** / **`logged_at`**.
- **`sylo_health_log_list`** — one day via **`date`**, or a range via **`start_date`** + **`end_date`** (max 93 days).
- **`sylo_health_daily_summaries`** — per-day macro totals across a range (e.g. last week, last month).
- **`sylo_health_daily_summary`** / **`sylo_health_remaining_macros`** — single day (defaults to today).

When the operator says *"last week"* or *"last month"*, compute concrete `start_date` and `end_date` in YYYY-MM-DD.

## When were meals logged? (local date/time)

Meal tools return **operator-local** date/time fields on every entry — you do **not** convert timestamps yourself:

| Field | Meaning |
|-------|---------|
| `logged_datetime_local` | `Monday 2026-06-08 12:00` — **cite this** when answering *"what date was that meal?"* |
| `logged_date` | Local calendar day `YYYY-MM-DD` |
| `logged_day_of_week` | Local weekday name, e.g. `Monday` — **never guess** the weekday yourself |
| `logged_time` | Local time `HH:MM` (24h) |
| `logged_at` | Unix ms stored in the DB — for machines only; **never** guess dates or weekdays from this number |

`sylo_health_daily_summaries` includes **`day_of_week`** per day. Use **`logged_day_of_week`** / **`day_of_week`** from tool JSON — do not compute weekdays in your head.

`sylo_health_log_list` also puts dates in the first summary line, e.g. `Found 2 meal log entries: Sunday 2026-06-07 22:00 — salad; Monday 2026-06-08 12:00 — burrito.`

When logging with only **`date`** (no `logged_at`), the entry is stored at **noon local** on that day. Prefer **`date`** for past/future days; avoid passing raw `logged_at` unless you have a specific local time.

**Do not ask the operator for meal clock time** when logging — calendar day is what matters; backfills and next-day logging are normal. The Health dashboard uses a daily calorie meter (not an intraday chart) for Today.

## Editing

- **`sylo_health_log_update`** / **`sylo_health_log_delete`** when the operator corrects an entry.
- **`sylo_health_log_list`** to review a day or range.

## Tools (nutrition + vitals + journal)

| Tool | Use |
|------|-----|
| `sylo_health_profile_get` / `sylo_health_profile_set` | Profile and targets |
| `sylo_health_log_meal` | Save after confirm (`date` for any day) |
| `sylo_health_log_update` / `sylo_health_log_delete` | Meal corrections |
| `sylo_health_log_list` | Meal day or `start_date`..`end_date` |
| `sylo_health_daily_summary` | One day vs targets |
| `sylo_health_daily_summaries` | Range of daily summaries |
| `sylo_health_remaining_macros` | Suggestions for one day |
| `sylo_health_weight_log` / `_update` / `_delete` | Weigh-ins (`date` for any day) |
| `sylo_health_weight_list` / `_summary` / `_get` | Weight history |
| `sylo_health_journal_add` / `_update` / `_delete` | Context notes |
| `sylo_health_journal_list` / `_get` | Read notes for coaching |

Workout tools live in the **workouts** skill (`sylo_health_workout_*`). Web search/fetch for nutrition facts is **not** part of `sylo-health` — see **Web lookup priority** above. **`show_widget`** is provided by the host skill-surface extension, not this package.
