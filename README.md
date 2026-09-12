# sylo-health

Health tools for the **Sylo desktop app** — nutrition logging, workout tracking, vitals, and Garmin Connect sync. Ships a Sylo-only host plugin (Settings card, companion phone tabs) that is inert on vanilla Pi.


## Health host plugin (the app-level "user package" pattern)

The Sylo app (sylo-dev) ships a generic personal-plugin loader
(`apps/host/src/main/personal-plugin.ts`). At startup it resolves this bundle
(env `SYLO_HEALTH_DIR (legacy: SYLO_TOOLS_PERSONAL_DIR / SYLO_PERSONAL_TOOLS_DIR)` → `~/.pi/agent/settings.json` packages list →
`~/Documents/GitHub/sylo-health`) and imports `host/index.js`. No
personal-domain code lives in sylo-dev; updates to sylo-dev never touch this
bundle.

```bash
npm run build:host   # host-src/*.ts → host/index.js (committed)
npm run build:ui     # ui/ → skills/nutrition/routes/health/ (phone + sidebar app)
npm test             # host + health store tests
```

## Install (on any machine where you want these)

```bash
pi install git:github.com/Yeti-Trix/sylo-health   # adjust to your GitHub handle/repo
```

Then **Restart broker** in Sylo so the tools load.

To update later: `pi update`.

## Architecture notes

- This is a single Pi package with **multiple extensions** (`pi.extensions` is an array) —
  one install gets every personal tool.
- Tools are **global** once installed: they appear in every workspace. There is no
  per-workspace gating by design.
- No secrets in this repo. Any future personal tool that needs credentials must read them
  from machine-local config (`~/.pi/agent/extensions-config/` or `~/.sylo/`), never
  from here (this repo syncs across your machines via GitHub).
- Layout follows the standard Pi package format: `pi` field in package.json lists
  extension entry points and skill folders.

## Tests

```bash
npm install
npm test
```