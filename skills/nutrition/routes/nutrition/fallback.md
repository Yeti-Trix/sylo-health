# Nutrition (no sidebar UI)

When the Nutrition route is unavailable, use chat only:

1. **`sylo_health_profile_set`** — one-time setup (height, weight, age, sex, activity, target weight).
2. Describe or attach a photo of what you ate; the agent proposes macros and shows a **confirm panel** (or asks in chat) before saving.
3. **`sylo_health_daily_summary`** — calories and macros eaten vs your daily targets.
4. Ask *"what can I still eat today?"* — the agent calls **`sylo_health_remaining_macros`** and suggests options.

Enable **sylo-health** in Capability manager, then restart the broker. For restaurant items the agent searches the web — prefers **sylo-web-access** if enabled, otherwise your other web tools, otherwise a warned estimate.
