// Sylo host plugin — personal tools (health).
//
// This bundle is the "user package" for the Sylo app itself (same pattern as
// Pi packages: installed outside sylo-dev, resolved at runtime, never
// overwritten by app updates). The host (apps/host/src/main/personal-plugin.ts)
// resolves this bundle, imports host/index.js, and calls createPersonalPlugin()
// with generic host capabilities. All personal-domain code — health data layer,
// op names, settings card copy, phone-app root — lives HERE, not in sylo-dev.
//
// Built with `npm run build:host` → host/index.js (CJS bundle, electron
// external). host/index.js is committed so the host can load it without a
// build step.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHealthDb } from './health-db.js'

/** Generic host capabilities injected by sylo-dev's personal-plugin loader. */
export type PersonalPluginDi = {
  /** Explicit data-dir override from Settings (`sylo.personal.data_dir` pref), or null. */
  dataDirOverride: () => string | null
  /** Generic data root (the operator workspace, `<sylo-user>`). */
  dataRoot: () => string
  /** The Pi agent dir (skills live under `<agentDir>/skills/`). */
  hostAgentDir: () => string
  /** Register the companion (phone) app static root. */
  setPersonalAppRoot: (fn: () => string) => void
}

/** Ops handled by this plugin's rpc() (route bridge + companion RPC). */
export const PLUGIN_OPS = [
  'healthProfileGet',
  'healthDailySummary',
  'healthDailySummaries',
  'healthLogList',
  'healthWorkoutList',
  'healthWorkoutSummary',
  'healthExerciseHistory',
  'healthMuscleSummary',
  'healthWeightList',
  'healthWeightSummary',
  'healthJournalList',
  'healthPlanActive',
  'healthPlanList',
  'healthWorkoutGet',
  'healthWorkoutLog',
  'healthWorkoutUpdate',
  'healthWorkoutDelete',
] as const

/** Declarative Settings card (rendered by the host's generic PersonalSettingsCard). */
const SETTINGS_CARD = {
  title: 'Health data',
  lead:
    'Health logs (meals, workouts, weight, journal, Garmin) are git-synced JSON. By default they ' +
    'live in sylo-user/health — the operator-private universal workspace. Set an explicit override ' +
    'below only for exceptions.',
  prefKey: 'sylo.personal.data_dir',
  defaultLabel: 'Using default: sylo-user/health.',
  valuePrefix: 'Health data directory: ',
  pickLabel: 'Choose health data folder…',
  restartBrokerOnSave: true,
}

/**
 * Companion (phone) manifest — the phone app renders plugin tabs + the chat
 * landing card generically from this. `$today` in payload values is substituted
 * with the local YMD date by the client. Icon keys resolve against the
 * companion's neutral icon registry (utensils | dumbbell | activity | heart).
 */
const COMPANION_MANIFEST = {
  tabs: [
    { id: 'nutrition', label: 'Nutrition', icon: 'utensils' },
    { id: 'workout', label: 'Workout', icon: 'dumbbell' },
    { id: 'vitals', label: 'Vitals', icon: 'activity' },
  ],
  appBase: '/personal-app/index.html',
  landing: {
    op: 'healthWorkoutList',
    payload: { date: '$today', limit: 20 },
    title: "Today's workout",
    singleLabel: 'Workout',
    countNoun: 'workouts',
  },
}

/**
 * Mirror the bundle's freshly built health-UI route (ui/vite build output:
 * index.html + assets/ + fallback.md) into the agent-dir skill route that both
 * the desktop skill surface and the companion personal-app serve from. Always
 * overwrites index.html/fallback.md and prunes stale hashed asset files;
 * failures are non-fatal (the served app just stays on its previous build).
 */
export function syncBuiltHealthApp(builtDir: string, serveDir: string): void {
  try {
    if (!existsSync(join(builtDir, 'index.html'))) return
    mkdirSync(serveDir, { recursive: true })
    cpSync(join(builtDir, 'index.html'), join(serveDir, 'index.html'))
    const fallbackSrc = join(builtDir, 'fallback.md')
    if (existsSync(fallbackSrc)) cpSync(fallbackSrc, join(serveDir, 'fallback.md'))
    const srcAssets = join(builtDir, 'assets')
    const dstAssets = join(serveDir, 'assets')
    if (existsSync(srcAssets)) {
      mkdirSync(dstAssets, { recursive: true })
      for (const name of readdirSync(srcAssets)) {
        if (statSync(join(srcAssets, name)).isFile()) {
          cpSync(join(srcAssets, name), join(dstAssets, name))
        }
      }
      // Prune hashed assets from older builds so the serve dir mirrors the build.
      for (const name of readdirSync(dstAssets)) {
        if (!existsSync(join(srcAssets, name))) {
          try {
            rmSync(join(dstAssets, name), { force: true })
          } catch {
            /* file in use — leftover stale asset is harmless */
          }
        }
      }
    }
  } catch (err) {
    console.warn('[sylo-health] health-app asset sync failed:', err)
  }
}

export function createPersonalPlugin(di: {
  dataDirOverride: () => string | null
  dataRoot: () => string
  hostAgentDir: () => string
  setPersonalAppRoot: (fn: () => string) => void
}) {
  const dataDir = () => di.dataDirOverride() ?? join(di.dataRoot(), 'health')

  // Ensure the data dir exists (the host no longer pre-creates it).
  try {
    mkdirSync(dataDir(), { recursive: true })
  } catch {
    /* store calls surface real failures later */
  }

  // Companion (phone) + desktop health app — served from the agent-dir skill
  // route (`discoverSkillRoutes(agentDir)` and the host's personal-app root
  // both read `<agentDir>/skills`). Pi resolves LOCAL path packages in place
  // and does NOT copy their skill files, so that folder is only refreshed by
  // syncing the bundle's freshly built UI at plugin load (below). Without the
  // sync, a `build:ui` in this bundle would never reach the phone/desktop and
  // they'd keep loading a stale bundle (old RPC endpoint → 'not found' tabs —
  // happened 2026-09-10: deployed Sep 1 build called the pre-rename
  // /api/health/rpc after the server moved to /api/personal/rpc).
  syncBuiltHealthApp(join(dirname(dirname(fileURLToPath(import.meta.url))), 'skills', 'nutrition', 'routes', 'health'), join(di.hostAgentDir(), 'skills', 'nutrition', 'routes', 'health'))
  di.setPersonalAppRoot(() => join(di.hostAgentDir(), 'skills', 'nutrition', 'routes', 'health'))

  const db = createHealthDb(dataDir)

  function rpc(op: string, payload: unknown): unknown {
    const name = String(op ?? '').trim()
    const args = (payload ?? {}) as Record<string, unknown>
    switch (name) {
      case 'healthProfileGet':
        return db.healthProfileGet()
      case 'healthDailySummary':
        return db.healthDailySummary(args.date)
      case 'healthDailySummaries':
        return db.healthDailySummaries(args)
      case 'healthLogList':
        return db.healthLogList(args)
      case 'healthWorkoutList':
        return db.healthWorkoutList(args)
      case 'healthWorkoutSummary':
        return db.healthWorkoutSummary(args)
      case 'healthExerciseHistory':
        return db.healthExerciseHistory(args)
      case 'healthMuscleSummary':
        return db.healthMuscleSummary(args)
      case 'healthWeightList':
        return db.healthWeightList(args)
      case 'healthWeightSummary':
        return db.healthWeightSummary(args)
      case 'healthJournalList':
        return db.healthJournalList(args)
      case 'healthPlanActive':
        return db.healthPlanActive()
      case 'healthPlanList':
        return db.healthPlanList({ limit: typeof args.limit === 'number' ? args.limit : undefined })
      case 'healthWorkoutGet':
        return db.healthWorkoutGet(args)
      case 'healthWorkoutLog':
        return db.healthWorkoutLog(args)
      case 'healthWorkoutUpdate':
        return db.healthWorkoutUpdate(args)
      case 'healthWorkoutDelete':
        return db.healthWorkoutDelete(args)
      default:
        throw new Error('unknown_op')
    }
  }

  return {
    ops: [...PLUGIN_OPS],
    settingsCard: () => SETTINGS_CARD,
    companionManifest: () => COMPANION_MANIFEST,
    rpc,
  }
}