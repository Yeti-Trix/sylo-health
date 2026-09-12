export type RangePayload = {
  date?: string
  start_date?: string
  end_date?: string
  limit?: number
}

function hasDesktopNonce(): boolean {
  const nonce = (window as unknown as { __SYLO_NONCE__?: string }).__SYLO_NONCE__
  return typeof nonce === 'string' && nonce.length > 0
}

function rpcViaPostMessage<T>(op: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const reqId = `r-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as {
        kind?: string
        reqId?: string
        ok?: boolean
        result?: T
        error?: string
      }
      if (!d || d.kind !== 'sylo-skill-bridge-reply' || d.reqId !== reqId) return
      window.removeEventListener('message', onMsg)
      if (d.ok) resolve(d.result as T)
      else reject(new Error(d.error || 'bridge_error'))
    }
    window.addEventListener('message', onMsg)
    window.parent.postMessage(
      {
        v: 1,
        kind: 'sylo-skill-bridge',
        nonce: (window as unknown as { __SYLO_NONCE__?: string }).__SYLO_NONCE__,
        reqId,
        op,
        payload: payload ?? {},
      },
      '*',
    )
  })
}

async function rpcViaFetch<T>(op: string, payload?: unknown): Promise<T> {
  const res = await fetch('/api/personal/rpc', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, payload: payload ?? {} }),
  })
  if (res.status === 401) throw new Error('unauthorized')
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    result?: T
    error?: string
  }
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `http_${res.status}`)
  }
  return data.result as T
}

function rpc<T>(op: string, payload?: unknown): Promise<T> {
  if (hasDesktopNonce()) return rpcViaPostMessage<T>(op, payload)
  return rpcViaFetch<T>(op, payload)
}

export const bridge = {
  profileGet: () => rpc<import('./types').HealthProfile | null>('healthProfileGet', {}),
  dailySummary: (date?: string) =>
    rpc<import('./types').DailySummary | null>('healthDailySummary', { date }),
  dailySummaries: (args: RangePayload) =>
    rpc<import('./types').DailySummary[]>('healthDailySummaries', args),
  logList: (args: RangePayload) =>
    rpc<import('./types').MealEntry[]>('healthLogList', args),
  workoutList: (args: RangePayload) =>
    rpc<import('./types').WorkoutEntry[]>('healthWorkoutList', args),
  workoutSummary: (args: RangePayload) =>
    rpc<import('./types').WorkoutSummary>('healthWorkoutSummary', args),
  weightList: (args: RangePayload) =>
    rpc<import('./types').WeightEntry[]>('healthWeightList', args),
  weightSummary: (args: RangePayload) =>
    rpc<import('./types').WeightSummary>('healthWeightSummary', args),
  journalList: (args: RangePayload) =>
    rpc<import('./types').JournalEntry[]>('healthJournalList', args),
  exerciseHistory: (args: { name: string; limit?: number }) =>
    rpc<import('./types').ExerciseHistoryHit[]>('healthExerciseHistory', args),
  planActive: () => rpc<import('./types').WorkoutPlan | null>('healthPlanActive', {}),
    planList: (args?: { limit?: number }) =>
    rpc<import('./types').WorkoutPlan[]>('healthPlanList', args ?? {}),
  workoutLog: (
    args: {
      title?: string
      description?: string
      duration_min?: number
      calories_burned?: number
      exercises?: import('./types').WorkoutExercise[]
      notes?: string
      status?: import('./types').WorkoutStatus
      date?: string
    },
  ) =>
    rpc<{
      entry: import('./types').WorkoutEntry | null
      replaced_planned: boolean
    }>('healthWorkoutLog', args),
  workoutUpdate: (
    id: string,
    patch: {
      title?: string
      description?: string | null
      duration_min?: number | null
      calories_burned?: number | null
      exercises?: import('./types').WorkoutExercise[]
      notes?: string | null
      status?: import('./types').WorkoutStatus
      date?: string
    },
  ) => rpc<import('./types').WorkoutEntry>('healthWorkoutUpdate', { id, ...patch }),
  workoutDelete: (id: string) => rpc<{ ok: boolean }>('healthWorkoutDelete', { id }),
  workoutGet: (id: string) =>
    rpc<import('./types').WorkoutEntry | null>('healthWorkoutGet', { id }),
}
