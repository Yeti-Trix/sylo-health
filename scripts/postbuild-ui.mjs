import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dest = path.join(root, 'skills/nutrition/routes/health/fallback.md')
fs.copyFileSync(path.join(root, 'ui/fallback.md'), dest)
console.log('[sylo-health] copied ui/fallback.md →', dest)
