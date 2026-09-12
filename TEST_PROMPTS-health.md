# sylo-health — agent test prompts

Run with **Health** (+ **nutrition** / **workouts** skills) enabled and broker restarted.  
**Done** when every row passes: agent calls the right tool(s), data persists, and follow-up reads match.

Replace bracketed placeholders with real dates relative to **today**.

---

## Nutrition (meals)

| # | Send this prompt | Expected tool(s) | Pass criteria |
|---|------------------|------------------|---------------|
| N1 | Set my health profile: 180 cm, 187 lb, 34 years old, male, moderate activity, target weight 172 lb. | `sylo_health_profile_set` | Returns daily calorie + macro targets; stores `weight_lb` + `target_weight_lb`. |
| N2 | Log yesterday's lunch: grilled chicken salad, about 450 calories, 40g protein, 25g carbs, 18g fat. Confirm and save. | `sylo_health_log_meal` with `date` = yesterday | Entry `logged_at` falls on yesterday (local). |
| N3 | What did I eat yesterday? | `sylo_health_log_list` with `date` = yesterday | Lists N2 entry. |
| N4 | Show my nutrition for the last 7 days — daily calories and macros. | `sylo_health_daily_summaries` with `start_date` / `end_date` | 7 daily summaries returned. |
| N5 | List all my meals from [start of last month] through [end of last month]. | `sylo_health_log_list` with `start_date` + `end_date` | Entries in range only. |
| N6 | Change yesterday's lunch to 500 calories and 45g protein — same meal id. | `sylo_health_log_list` then `sylo_health_log_update` | Updated totals on that id. |
| N7 | Delete yesterday's lunch entry. | `sylo_health_log_delete` | Gone from yesterday's list. |
| N8 | How many calories do I have left today? | `sylo_health_remaining_macros` | Remaining calories + P/C/F. |

---

## Workouts

| # | Send this prompt | Expected tool(s) | Pass criteria |
|---|------------------|------------------|---------------|
| W1 | Log a workout for yesterday: 45 minute easy run, about 400 calories burned. | `sylo_health_workout_log` with `date` = yesterday | Entry on yesterday; cardio exercise has `duration_min: 45` and `muscle_groups: ["cardio"]`. |
| W2 | Schedule a workout for [next Tuesday]: upper body — bench 3x10, rows 3x10, 50 minutes. | `sylo_health_workout_log` with `date` = that Tuesday | Entry on that calendar day. |
| W3 | What workouts did I do in the last 7 days? | `sylo_health_workout_list` with `start_date` / `end_date` | Includes W1 if in range. |
| W4 | Summarize my workouts for the last 30 days — total sessions, minutes, calories. | `sylo_health_workout_summary` with ~30-day range | `workout_count`, `total_duration_min` sensible. |
| W5 | Change yesterday's run to 50 minutes and 450 calories. | `sylo_health_workout_list` or `get` then `sylo_health_workout_update` | Duration/calories updated. |
| W6 | Remove yesterday's run from my log. | `sylo_health_workout_delete` | Absent from list. |
| W7 | Move my [next Tuesday] workout to [next Wednesday] instead. | `sylo_health_workout_update` with new `date` | Shows on Wednesday. |

---

## Weight (vitals)

| # | Send this prompt | Expected tool(s) | Pass criteria |
|---|------------------|------------------|---------------|
| V1 | I weighed myself today — 185.6 lbs. | `sylo_health_weight_log` with `weight_lb` | Entry saved; profile weight updates. |
| V2 | Log my weight as 188 lbs for [3 days ago]. | `sylo_health_weight_log` with `date` + `weight_lb` | Entry on that day. |
| V3 | Show my weight history for the last 7 days. | `sylo_health_weight_list` with range | Lists weigh-ins. |
| V4 | How has my weight trended this month? | `sylo_health_weight_summary` | Latest + change in range. |
| V5 | Fix [3 days ago]'s weigh-in to 86 kg instead. | `sylo_health_weight_list` then `sylo_health_weight_update` | Updated value. |
| V6 | Delete [3 days ago]'s weigh-in. | `sylo_health_weight_delete` | Gone from list. |

---

## Health journal

| # | Send this prompt | Expected tool(s) | Pass criteria |
|---|------------------|------------------|---------------|
| J1 | Note for my health log: my back has been hurting this week. | `sylo_health_journal_add` with `category` pain | Note saved. |
| J2 | What health notes do I have from the last 7 days? | `sylo_health_journal_list` | Includes J1. |
| J3 | Update that back note — it's improving after stretching. | `sylo_health_journal_update` | Body text updated. |
| J4 | Delete the back note. | `sylo_health_journal_delete` | Absent from list. |
| J5 | My back is fine now — resolve that pain note. | `sylo_health_journal_update` with `active: false` | Note inactive; absent from `active_only` list. |
| T6 | Log today's push workout (bench 3x8 @ 195) when push was planned today. | `sylo_health_workout_log` completed | `replaced_planned: true`; no duplicate row. |

---

## Personal trainer (workouts)

| # | Send this prompt | Expected tool(s) | Pass criteria |
|---|------------------|------------------|---------------|
| T1 | What did I bench last time? | `sylo_health_exercise_history` with name bench | Cites real dates + weights from history. |
| T2 | Plan my workouts for next week — upper/lower split. | `sylo_health_muscle_summary` + `journal_list` then multiple `workout_log` with `status: planned` | Future-dated planned sessions on correct days. |
| T3 | I did Monday's workout — bench 3x8 at 185 lbs, felt heavy. | `workout_list` planned → `workout_update` completed + actuals; optional `journal_add` coach_note | Updates planned row, no duplicate. |
| T4 | Skip Thursday's leg day — traveling. | `workout_update` status skipped | Shows skipped in summary. |
| T5 | What muscle groups am I neglecting lately? | `sylo_health_muscle_summary` over ~4–8 weeks | Names gaps + suggests exercises. |
| T6 | My shoulder hurts — plan upper body around that. | `journal_list` first; plan avoids aggravating lifts | Respects pain note. |
| T7 | Log squat 225 lbs for 5x5 today. | `workout_log` with `weight_lb: 225` | Stores lbs; agent cites lb in chat. |
| T8 | Plan my training for the next month. | Multiple range queries (chunk if >93d); planned sessions logged | Month outline with dated `planned` rows. |
| T9 | Build me a 4-day weekly lifting program. | `sylo_health_plan_set` + planned workout rows | Plan saved as active version (NOT journal); shows on Workouts tab Training plan panel. |
| T10 | Change my program: drop Friday, add 5 lb to bench. | `sylo_health_plan_get` then `sylo_health_plan_set` with rationale | New active version; old one archived; `plan_list` shows both. |
| T11 | How has my training program changed over time? | `sylo_health_plan_list` | Cites versions with dates + rationales. |

---

## Coaching

| # | Send this prompt | Expected tool(s) | Pass criteria |
|---|------------------|------------------|---------------|
| CO1 | How am I doing this week on calories and weight toward my goal? | `sylo_health_daily_summaries` + `sylo_health_weight_summary` (+ maybe `journal_list`) | Weekly pattern + actionable advice. |
| CO2 | I've been over my calories — suggest dinner options that fit what's left today. | `sylo_health_remaining_macros` + web lookup if needed | Concrete suggestions within remaining macros. |

---

## Combined smoke

| # | Send this prompt | Expected | Pass criteria |
|---|------------------|----------|---------------|
| C1 | Give me a quick recap: workouts and calories eaten for the last 7 days. | `sylo_health_workout_summary` + `sylo_health_daily_summaries` (or equivalent) | Both domains answered with date range. |

---

## Notes for the tester

- Agent must **confirm** before `sylo_health_log_meal` (widget or explicit yes).
- Workouts and weight do not require confirm — direct log tools are fine.
- Weight and journal notes should use **`date`** for backfills; agent should not ask for clock time.
- If a prompt fails, note which tool was called vs expected and fix SKILL.md or tools before marking done.
