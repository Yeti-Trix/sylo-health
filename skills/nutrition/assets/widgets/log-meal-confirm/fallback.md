# Meal confirm (widget unavailable)

When the confirm widget cannot render, use plain chat:

1. List each food item with serving (if known), calories, protein, carbs, and fat.
2. Show meal totals and note whether macros came from **web lookup**, **photo estimate**, or **model guess** (warn on guess).
3. Ask the operator to reply **yes** to save or **no** to adjust.
4. On **yes**, call **`sylo_health_log_meal`** with the confirmed `description`, `items`, `source`, and totals.
