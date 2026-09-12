# Health (no sidebar UI)

When the Health route is unavailable, use chat only:

1. **`sylo_health_profile_set`** — one-time setup (height cm, weight lb, age, sex, activity, goal weight lb).
2. Log meals with confirm; log workouts with **`sylo_health_workout_log`**.
3. **`sylo_health_weight_log`** — weigh-ins for any day; **`sylo_health_journal_add`** — health context notes.
4. **`sylo_health_daily_summary`** / **`sylo_health_daily_summaries`** — nutrition totals.
5. **`sylo_health_workout_summary`** / **`sylo_health_weight_summary`** — range totals.

Enable **sylo-health** in Capability manager, then restart the broker.
