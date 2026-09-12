export type HealthSex = 'male' | 'female' | 'other'

export type HealthActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active'

export type MealLogSource = 'operator_text' | 'operator_photo' | 'agent_estimate'

export type MealLogItem = {
  name: string
  serving?: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export type HealthProfileRow = {
  id: string
  height_cm: number
  /** Operator/agent canonical unit (US lbs). */
  weight_lb: number
  /** Derived for TDEE and dual-unit UI. */
  weight_kg: number
  age_years: number
  sex: HealthSex
  activity_level: HealthActivityLevel
  works_out: number
  /** Operator/agent canonical goal weight (US lbs). */
  target_weight_lb: number
  /** Derived for deficit math and dual-unit UI. */
  target_weight_kg: number
  target_weeks: number | null
  daily_calorie_target: number
  protein_g_target: number
  carbs_g_target: number
  fat_g_target: number
  updated_at: number
}

export type MealLogEntryRow = {
  id: string
  logged_at: number
  /** Local YYYY-MM-DD — populated in tool responses */
  logged_date?: string
  /** Local weekday name — populated in tool responses */
  logged_day_of_week?: string
  /** Local HH:MM — populated in tool responses */
  logged_time?: string
  /** Local weekday + YYYY-MM-DD HH:MM — populated in tool responses */
  logged_datetime_local?: string
  description: string
  items: MealLogItem[]
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  source: MealLogSource
  notes: string | null
  updated_at: number
}

export type DailySummary = {
  date: string
  /** Local weekday for date, e.g. Monday */
  day_of_week: string
  day_start_ms: number
  day_end_ms: number
  targets: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
  consumed: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
  remaining: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
  entry_count: number
}

export type WorkoutStatus = 'completed' | 'planned' | 'skipped'

/** One physical set in a per-set breakdown (optional richer tracking). */
export type WorkoutSetEntry = {
  done?: boolean
  weight_lb?: number
  weight_kg?: number
  reps?: number
}

export type WorkoutExercise = {
  name: string
  sets?: number
  reps?: number
  /** Operator/agent canonical unit (US lbs). */
  weight_lb?: number
  /** Derived for volume math and dual-unit UI. */
  weight_kg?: number
  /** Optional per-set breakdown (companion tracker). Absent = plain sets×reps×weight. */
  set_list?: WorkoutSetEntry[]
  duration_min?: number
  notes?: string
  muscle_groups?: string[]
}

export type WorkoutLogEntryRow = {
  id: string
  logged_at: number
  logged_date?: string
  logged_day_of_week?: string
  logged_time?: string
  logged_datetime_local?: string
  title: string
  description: string | null
  duration_min: number | null
  calories_burned: number | null
  exercises: WorkoutExercise[]
  notes: string | null
  status: WorkoutStatus
  updated_at: number
}

export type WorkoutRangeSummary = {
  start_date: string
  end_date: string
  workout_count: number
  completed_count: number
  planned_count: number
  skipped_count: number
  total_duration_min: number
  total_calories_burned: number
  entries: WorkoutLogEntryRow[]
}

export type ExerciseHistoryHit = {
  workout_id: string
  workout_title: string
  workout_status: WorkoutStatus
  logged_at: number
  logged_date?: string
  logged_day_of_week?: string
  logged_datetime_local?: string
  exercise: WorkoutExercise
}

export type MuscleGroupSummaryRow = {
  muscle_group: string
  session_count: number
  set_count: number
  rep_count: number
  volume_kg: number
}

export type MuscleRangeSummary = {
  start_date: string
  end_date: string
  groups: MuscleGroupSummaryRow[]
}

export type WeightLogSource = 'operator_manual' | 'scale' | 'agent_estimate'

export type WeightLogEntryRow = {
  id: string
  logged_at: number
  logged_date?: string
  logged_day_of_week?: string
  logged_time?: string
  logged_datetime_local?: string
  /** Operator/agent canonical unit (US lbs). */
  weight_lb: number
  /** Derived for profile TDEE sync and dual-unit UI. */
  weight_kg: number
  source: string
  notes: string | null
  updated_at: number
}

export type WeightRangeSummary = {
  start_date: string
  end_date: string
  entry_count: number
  latest_weight_lb: number | null
  latest_weight_kg: number | null
  target_weight_lb: number | null
  target_weight_kg: number | null
  change_lb: number
  change_kg: number
  entries: WeightLogEntryRow[]
}

export type WorkoutPlanStatus = 'active' | 'archived'

export type WorkoutPlanDay = {
  /** Weekday or slot label, e.g. "Monday", "Day 1". */
  day: string
  /** Session focus, e.g. "Push", "Legs", "Rest". */
  focus?: string
  exercises: WorkoutExercise[]
  notes?: string
}

export type WorkoutPlanRow = {
  id: string
  created_at: number
  /** Local YYYY-MM-DD — populated in tool responses */
  created_date?: string
  created_datetime_local?: string
  title: string
  days: WorkoutPlanDay[]
  /** Why this plan exists / what changed from the previous version. */
  rationale: string | null
  status: WorkoutPlanStatus
  updated_at: number
}

export type HealthJournalEntryRow = {
  id: string
  logged_at: number
  logged_date?: string
  logged_day_of_week?: string
  logged_time?: string
  logged_datetime_local?: string
  body: string
  category: string | null
  /** Ongoing constraint the agent should respect until resolved (pain, injury, preference). */
  active: boolean
  updated_at: number
}

export type InsertWorkoutLogResult = {
  entry: WorkoutLogEntryRow
  /** True when a same-day planned session was updated instead of inserting a duplicate row. */
  replaced_planned: boolean
}

/** One day of Garmin Connect (cloud) metrics for the Venu 4, pulled via the
 * `garminconnect` Python sidecar and stored idempotently by date. */
export type GarminDailyRow = {
  /** Garmin calendar date, local YYYY-MM-DD (primary key for upsert). */
  date: string
  /** ms — day local midnight, used for month bucketing + ordering. */
  logged_at: number
  source: 'garmin_connect'
  updated_at: number
  // vitals
  resting_hr: number | null
  max_hr: number | null
  min_hr: number | null
  /** 7-day average resting HR — trend context from Garmin. */
  rhr_7day_avg: number | null
  hrv_avg: number | null
  /** Highest 5-min HRV reading during the night. */
  hrv_5min_high: number | null
  /** Garmin qualitative status: BALANCED, UNBALANCED, LOW, etc. */
  hrv_status: string | null
  /** Rolling weekly average HRV. */
  hrv_weekly_avg: number | null
  /** Baseline lower bound for "balanced" — context for hrv_avg comparisons. */
  hrv_baseline_balanced_low: number | null
  vo2_max: number | null
  // sleep (seconds)
  sleep_seconds: number | null
  deep_sleep_seconds: number | null
  rem_sleep_seconds: number | null
  light_sleep_seconds: number | null
  awake_sleep_seconds: number | null
  /** Garmin sleep score (0–100). */
  sleep_score: number | null
  /** Qualitative sleep score label: EXCELLENT, FAIR, POOR, etc. */
  sleep_score_qualifier: string | null
  /** Deep sleep percentage (0–100). */
  deep_sleep_pct: number | null
  /** REM sleep percentage (0–100). */
  rem_sleep_pct: number | null
  /** Garmin sleep feedback code, e.g. NEGATIVE_LONG_BUT_NOT_RESTORATIVE. */
  sleep_feedback: string | null
  /** Garmin sleep insight code, e.g. NEGATIVE_HIGHLY_STRESSFUL_DAY. */
  sleep_insight: string | null
  /** Personalized sleep insight code. */
  sleep_personalized_insight: string | null
  /** Average heart rate during sleep. */
  sleep_avg_hr: number | null
  /** Average stress during sleep. */
  sleep_avg_stress: number | null
  /** Number of awakenings during the sleep period. */
  sleep_awake_count: number | null
  /** Lowest SpO2 during sleep (from sleep DTO). */
  sleep_lowest_spo2: number | null
  // overnight
  spo2_avg: number | null
  spo2_sleep_avg: number | null
  /** Lowest SpO2 reading of the day. */
  spo2_min: number | null
  /** 7-day average SpO2 — trend context. */
  spo2_7day_avg: number | null
  respiration_avg: number | null
  // stress / activity
  stress_avg: number | null
  /** Maximum stress level recorded during the day. */
  stress_max: number | null
  steps: number | null
  distance_m: number | null
  floors: number | null
  // energy
  calories_total: number | null
  calories_active: number | null
  body_battery_charged: number | null
  body_battery_drained: number | null
  /** End-of-day body battery level label: VERY_LOW, LOW, MODERATE, HIGH, etc. */
  body_battery_end_level: string | null
  // training
  training_readiness_score: number | null
  /** Garmin qualitative level: POOR, LOW, MODERATE, HIGH, etc. */
  training_readiness_level: string | null
  /** Garmin feedback code, e.g. TIME_TO_SLOW_DOWN, LISTEN_TO_YOUR_BODY. */
  training_readiness_feedback: string | null
  fitness_age: number | null
  /** HR zone floors [z1, z2, z3, z4, z5] (account-level, rarely changes). */
  hr_zones: number[] | null
  /** Full endpoint dump for the day, kept for re-extraction. NOT included in
   *  tool responses (stripped by stripRawJson) — use re-extract or analytics
   *  scripts to access the raw data. */
  raw_json: Record<string, unknown> | null
  /** Local YYYY-MM-DD — populated in tool responses. */
  logged_date?: string
  /** Local weekday + YYYY-MM-DD — populated in tool responses. */
  logged_datetime_local?: string
}

export type GarminRangeSummary = {
  start_date: string
  end_date: string
  entry_count: number
  entries: GarminDailyRow[]
}

/** Compact per-day coaching summary — no raw_json, computed human-readable
 *  fields (hours, percentages), designed for LLM context efficiency.
 *  Produced by buildGarminReport() from stored GarminDailyRow entries. */
export type GarminReportDay = {
  date: string
  day_of_week: string
  /** When this day's data was last synced from Garmin Connect (Unix ms).
   *  Lets the AI report data freshness per-day in coaching reports. */
  updated_at: number
  // Recovery
  training_readiness: {
    score: number | null
    level: string | null
    feedback: string | null
  }
  body_battery: {
    charged: number | null
    drained: number | null
    end_level: string | null
  }
  hrv: {
    avg: number | null
    high: number | null
    status: string | null
    weekly_avg: number | null
    baseline_balanced_low: number | null
  }
  // Sleep
  sleep: {
    total_hours: number | null
    deep_hours: number | null
    deep_pct: number | null
    rem_hours: number | null
    rem_pct: number | null
    light_hours: number | null
    awake_hours: number | null
    score: number | null
    score_qualifier: string | null
    feedback: string | null
    insight: string | null
    personalized_insight: string | null
    avg_hr: number | null
    avg_stress: number | null
    awake_count: number | null
    lowest_spo2: number | null
  }
  // Vitals
  vitals: {
    resting_hr: number | null
    max_hr: number | null
    min_hr: number | null
    rhr_7day_avg: number | null
    spo2_avg: number | null
    spo2_min: number | null
    spo2_7day_avg: number | null
    respiration_avg: number | null
    stress_avg: number | null
    stress_max: number | null
    vo2_max: number | null
    fitness_age: number | null
  }
  // Activity
  activity: {
    steps: number | null
    distance_km: number | null
    floors: number | null
    calories_total: number | null
    calories_active: number | null
  }
}

/** Min/avg/max aggregate for a single metric across a date range.
 *  `count` = how many days had a non-null value; `total` = total days in range.
 *  If count < total, the average is based on partial data — the AI must
 *  disclose this (e.g. "based on 2 of 7 days"). */
export type GarminMetricAgg = {
  min: number | null
  avg: number | null
  max: number | null
  /** How many days in the range had a non-null value for this metric. */
  count: number
  /** Total days in the range (denominator for coverage disclosure). */
  total: number
}

/** Compact range report — per-day summaries + range aggregates.
 *  This is the LLM-optimized format: no raw_json, computed fields, and
 *  min/avg/max aggregates for trend analysis. */
export type GarminReport = {
  start_date: string
  end_date: string
  day_count: number
  days: GarminReportDay[]
  aggregates: {
    training_readiness: GarminMetricAgg | null
    body_battery_charged: GarminMetricAgg | null
    hrv_avg: GarminMetricAgg | null
    deep_sleep_hours: GarminMetricAgg | null
    sleep_score: GarminMetricAgg | null
    stress_avg: GarminMetricAgg | null
    resting_hr: GarminMetricAgg | null
    spo2_avg: GarminMetricAgg | null
  }
}
