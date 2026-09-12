import { activeJournalContextForTool } from './active-journal-context.js'
import type { HealthStore } from './health-store.js'

type ToolContentBlock = { type: 'text'; text: string }

export function healthToolOk(
  s: HealthStore,
  summary: string,
  data: Record<string, unknown>,
): { content: ToolContentBlock[] } {
  const { summarySuffix, active_health_notes } = activeJournalContextForTool(s)
  const fullSummary = summarySuffix ? `${summary}${summarySuffix}` : summary
  const payload =
    active_health_notes.length > 0 ? { ...data, active_health_notes } : data
  return {
    content: [
      { type: 'text', text: fullSummary },
      { type: 'text', text: JSON.stringify(payload, null, 2) },
    ],
  }
}