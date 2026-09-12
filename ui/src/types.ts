export type HealthProfile = {
  daily_calorie_target: number
  protein_g_target: number
  carbs_g_target: number
  fat_g_target: number
  weight_lb: number
  weight_kg: number
  target_weight_lb: number
  target_weight_kg: number
}

export type MacroTotals = {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export type DailySummary = {
  date: string
  day_of_week: string
  targets: MacroTotals
  consumed: MacroTotals
  remaining: MacroTotals
  entry_count: number
}

export type MealEntry = {
  id: string
  description: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  logged_date?: string
  logged_datetime_local?: string
  logged_day_of_week?: string
}

export type WorkoutStatus = 'completed' | 'planned' | 'skipped'

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
  weight_lb?: number
  weight_kg?: number
  set_list?: WorkoutSetEntry[]
  duration_min?: number
  notes?: string
  muscle_groups?: string[]
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

export type WorkoutEntry = {
  id: string
  title: string
  duration_min: number | null
  calories_burned: number | null
  status?: WorkoutStatus
  exercises?: WorkoutExercise[]
  notes?: string | null
  logged_date?: string
  logged_datetime_local?: string
}

export type WorkoutPlanStatus = 'active' | 'archived'

export type WorkoutPlanDay = {
  day: string
  focus?: string
  exercises: WorkoutExercise[]
  notes?: string
}

export type WorkoutPlan = {
  id: string
  created_at: number
  created_date?: string
  created_datetime_local?: string
  title: string
  days: WorkoutPlanDay[]
  rationale: string | null
  status: WorkoutPlanStatus
}

export type WorkoutSummary = {
  start_date: string
  end_date: string
  workout_count: number
  completed_count: number
  planned_count: number
  skipped_count: number
  total_duration_min: number
  total_calories_burned: number
  entries: WorkoutEntry[]
}

export type WeightEntry = {
  id: string
  weight_kg: number
  weight_lb?: number
  notes?: string | null
  logged_date?: string
  logged_day_of_week?: string
}

export type WeightSummary = {
  start_date: string
  end_date: string
  entry_count: number
  latest_weight_lb: number | null
  latest_weight_kg: number | null
  target_weight_lb: number | null
  target_weight_kg: number | null
  change_lb: number
  change_kg: number
  entries: WeightEntry[]
}

export type JournalEntry = {
  id: string
  body: string
  category?: string | null
  active?: boolean
  logged_date?: string
  logged_day_of_week?: string
}
