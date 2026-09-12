/**
 * Garmin Connect fetcher — spawns the `garmin_fetch.py` Python sidecar and
 * parses its raw dump JSON into the metrics the health store keeps.
 *
 * The sidecar reuses the audited `garminconnect` library + the proven login
 * flow (see lab/experiments/EXP-001-garmin-cloud-pull). It is non-interactive:
 * it relies on a cached refresh token. First-time MFA login is a manual
 * one-time step (run the script by hand once to seed `garmin_tokens.json`).
 *
 * Resolution order (all overridable via env, sensible dev defaults):
 *   SYLO_GARMIN_PYTHON  — python executable (else detect venv / 'python')
 *   SYLO_GARMIN_SCRIPT  — path to garmin_fetch.py (else find in package)
 *   SYLO_GARMIN_ENV     — garmin credentials file (else <health-dir>/../.sylo/garmin.env)
 *   GARMIN_EMAIL/PASSWORD — passed through to the subprocess
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Node CJS global when available; fall back to import.meta.url for ESM bundles.
const SCRIPT_DIR =
  typeof __dirname !== 'undefined' ?
    __dirname
  : dirname(fileURLToPath(import.meta.url))

/** Parse a simple KEY=VALUE env file (no shell expansion). */
function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

/** Resolve the health data dir the same way the store does (best-effort). */
function healthDir(): string | null {
  const dataDir = process.env.SYLO_PERSONAL_DATA_DIR?.trim()
  if (dataDir) return dataDir
  const direct = process.env.SYLO_HEALTH_DIR?.trim()
  if (direct) return direct
  const dataRoot = process.env.SYLO_PERSONAL_DATA_ROOT?.trim()
  if (dataRoot) return join(dataRoot, 'health')
  const dbPath = process.env.SYLO_HEALTH_DB_PATH?.trim() || process.env.SYLO_DB_PATH?.trim()
  if (dbPath) return join(dirname(dirname(dbPath)), 'health')
  const userDir = process.env.SYLO_USER_DIR?.trim()
  if (userDir) return join(userDir, 'health')
  return null
}

/** Resolve the garmin credentials file. */
function resolveEnvFile(): string | null {
  const fromEnv = process.env.SYLO_GARMIN_ENV?.trim()
  if (fromEnv) return fromEnv
  const hd = healthDir()
  if (hd) {
    // <sylo-user>/.sylo/garmin.env  (health dir is <sylo-user>/health)
    const cand = join(dirname(hd), '.sylo', 'garmin.env')
    if (existsSync(cand)) return cand
  }
  return null
}

/** Resolve the cached Garmin refresh-token file (gitignored). Falls back to the
 * lab experiment token in dev so the sync works today without moving files. */
function resolveTokenFile(): string | null {
  const fromEnv = process.env.GARMIN_TOKEN_FILE?.trim()
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const hd = healthDir()
  if (hd) {
    const cand = join(dirname(hd), '.sylo', 'garmin_tokens.json')
    if (existsSync(cand)) return cand
  }
  // Dev fallback: the EXP-001 POC token.
  const lab = join(
    process.cwd(),
    'lab',
    'experiments',
    'EXP-001-garmin-cloud-pull',
    'garmin_tokens.json',
  )
  if (existsSync(lab)) return lab
  return null
}

/** Collect credentials (env wins; env file fills the gaps). */
function collectCredentials(): { email?: string; password?: string; envFile?: string } {
  const envFile = resolveEnvFile()
  const parsed = envFile ? parseEnvFile(envFile) : {}
  return {
    email: process.env.GARMIN_EMAIL?.trim() || parsed.GARMIN_EMAIL,
    password: process.env.GARMIN_PASSWORD?.trim() || parsed.GARMIN_PASSWORD,
    envFile: envFile ?? undefined,
  }
}

/** Resolve the python executable. */
function resolvePython(): string {
  const fromEnv = process.env.SYLO_GARMIN_PYTHON?.trim()
  if (fromEnv) return fromEnv
  // Dev default: the lab experiment venv that already has garminconnect installed.
  const candidates = [
    join(process.cwd(), 'lab', 'experiments', 'EXP-001-garmin-cloud-pull', '.venv', 'Scripts', 'python.exe'),
    join(process.cwd(), 'lab', 'experiments', 'EXP-001-garmin-cloud-pull', '.venv', 'bin', 'python'),
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return 'python'
}

/** Resolve the sidecar script path. */
function resolveScript(): string {
  const fromEnv = process.env.SYLO_GARMIN_SCRIPT?.trim()
  if (fromEnv) return fromEnv
  // Walk up from this file to find this bundle's scripts/garmin_fetch.py
  // (shared/ → bundle root → scripts/). Legacy probe for the pre-split
  // packages/sylo-health layout kept for back-compat.
  let dir = SCRIPT_DIR
  for (let i = 0; i < 8; i++) {
    const cand2 = join(dir, 'scripts', 'garmin_fetch.py')
    if (existsSync(cand2)) return cand2
    const cand = join(dir, 'packages', 'sylo-health', 'scripts', 'garmin_fetch.py')
    if (existsSync(cand)) return cand
    dir = dirname(dir)
  }
  // Fallback: assume relative to shared/ in this bundle.
  return resolve(SCRIPT_DIR, '..', 'scripts', 'garmin_fetch.py')
}

export type FetchResult = {
  date: string
  dump: Record<string, unknown>
  warnings: string[]
}

/**
 * Pull one day from Garmin Connect via the sidecar. Returns the raw dump.
 * Throws if the token is missing/expired (operator must run the interactive
 * login first) or the sidecar fails.
 */
export async function fetchGarminDay(targetDate: string): Promise<FetchResult> {
  const python = resolvePython()
  const script = resolveScript()
  if (!existsSync(script)) {
    throw new Error(
      `Garmin sidecar script not found: ${script}. Set SYLO_GARMIN_SCRIPT to the absolute path of garmin_fetch.py.`,
    )
  }
  const creds = collectCredentials()
  if (!creds.email || !creds.password) {
    throw new Error(
      'Garmin credentials not configured. Set GARMIN_EMAIL/GARMIN_PASSWORD env, or create a garmin.env at <sylo-user>/.sylo/garmin.env (gitignored) with GARMIN_EMAIL=... and GARMIN_PASSWORD=...',
    )
  }

  const env: NodeJS.ProcessEnv = { ...process.env, GARMIN_EMAIL: creds.email, GARMIN_PASSWORD: creds.password }
  if (creds.envFile) env.GARMIN_ENV_FILE = creds.envFile
  const tokenFile = resolveTokenFile()
  if (tokenFile) env.GARMIN_TOKEN_FILE = tokenFile

  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  const exit = await new Promise<number | null>((resolveP) => {
    const child = spawn(python, [script, '--json', targetDate], {
      env,
      windowsHide: true,
    })
    child.stdout.on('data', (d: Buffer) => stdoutChunks.push(d))
    child.stderr.on('data', (d: Buffer) => stderrChunks.push(d))
    child.on('error', (err) => {
      // Re-throw as a rejection via stderr marker.
      stderrChunks.push(Buffer.from(`\n[fetch] spawn error: ${err.message}`))
      resolveP(-1)
    })
    child.on('exit', (code) => resolveP(code))
  })

  const stderr = Buffer.concat(stderrChunks).toString('utf8')
  if (exit !== 0) {
    const hint = /MFA|token|login/i.test(stderr)
      ? ' The cached Garmin token may be missing or expired. Run the sidecar interactively once (python garmin_fetch.py <date>) to complete MFA and seed garmin_tokens.json, then retry the sync.'
      : ''
    throw new Error(`Garmin sidecar exited ${exit}.${hint}\n${stderr.slice(-1200)}`)
  }

  const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim()
  if (!stdout) {
    throw new Error(`Garmin sidecar produced no JSON output.\n${stderr.slice(-800)}`)
  }

  let dump: Record<string, unknown>
  try {
    dump = JSON.parse(stdout) as Record<string, unknown>
  } catch (e) {
    throw new Error(
      `Garmin sidecar output was not valid JSON: ${e instanceof Error ? e.message : String(e)}\n${stdout.slice(0, 400)}`,
    )
  }

  // Collect endpoint-level warnings (_error / _skipped) without failing.
  const warnings: string[] = []
  for (const [label, value] of Object.entries(dump)) {
    if (value && typeof value === 'object' && '_error' in (value as Record<string, unknown>)) {
      warnings.push(`${label}: ${(value as Record<string, unknown>)._error}`)
    } else if (value && typeof value === 'object' && '_skipped' in (value as Record<string, unknown>)) {
      warnings.push(`${label}: skipped (${(value as Record<string, unknown>)._skipped})`)
    }
  }

  return { date: targetDate, dump, warnings }
}