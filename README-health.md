# sylo-health

Sylo optional package for personal health: **nutrition** (MVP), **workouts** (planned), and **device sync** (Garmin / Renpho / Google Fit — post-MVP).

## MVP (nutrition)

1. Set profile (height, weight, age, activity, target weight) → daily calorie + macro targets.
2. Log meals in chat by **text or photo**; agent looks up restaurant items via web search — **prefers `sylo-web-access` when enabled**, otherwise whatever search tools you have, otherwise a warned best-guess.
3. Confirm before save; data stored locally in Sylo SQLite.
4. Open sidebar **Nutrition** for today's intake, remaining calories, and charts.

## Dependencies

- **`sylo-health`** registers only `sylo_health_*` tools (profile, log, summaries).
- **Web lookup** is agent-driven: `sylo-web-access` first if enabled, then other web tools, then estimate + warn. Not bundled in this package.
- Operator's configured vision model for meal photos.

## Enable

1. `npm run bootstrap-pi` (from repo root)
2. Capability manager → **Sylo optional packages** → **Health** → On
3. Restart broker

## Status

Phase 1–2 on disk (tools, route, confirm widget). Charts = Phase 3. See `features_tracker/active/2026-06-05_14-00-00_sylo_health_nutrition_package.md`.
