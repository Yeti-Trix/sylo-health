import { enrichJournalEntries, listActiveJournalEntries } from './journal-store.js'
import type { HealthStore } from './health-store.js'
import type { HealthJournalEntryRow } from './types.js'

export type ActiveJournalContext = {
  summarySuffix: string
  active_health_notes: HealthJournalEntryRow[]
}

/** Short line appended to workout/plan tool summaries so the agent always sees ongoing constraints. */
export function activeJournalContextForTool(s: HealthStore): ActiveJournalContext {
  const notes = enrichJournalEntries(listActiveJournalEntries(s))
  if (notes.length === 0) {
    return { summarySuffix: '', active_health_notes: [] }
  }
  const lines = notes.map((e) => {
    const tag = e.category ? `[${e.category}] ` : ''
    return `${tag}${e.body}`
  })
  return {
    summarySuffix: `\n\nActive health notes: ${lines.join('; ')}.`,
    active_health_notes: notes,
  }
}