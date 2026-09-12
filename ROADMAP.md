# sylo-health — Body‑comp tracker + repo rename (roadmap)

> Plan doc for this bundle. **Target name: `sylo-health`.**
> Owner: Spencer + agent. Status: **planning** (2026‑09‑12).
> The rename + body‑comp build are work packages — the GitHub/folder half of the rename
> is **gated on operator approval** (cross‑machine URL change).

## Goal

Turn this bundle from "weight‑logging health tools" into a full **body composition**
tracker (weight + body fat % + skeletal muscle + visceral + body water + BMR + …), with a
**programmatic** data path that ends the "Spencer sends a picture of the scale" loop.
Plus: rename to `sylo-health` and scrub the news/reddit leftovers out of the description.

## Facts that drive the design (verified)

- Scale today: **RENPHO ES‑CS20M** (BIA). The full body‑comp panel only exists in the
  Renpho Health app.
- **RENPHO → Google Fit = weight only.** Confirmed in the RENPHO manual (p.17): *"…the
  data 'weight' will sync to Google Fit."* So Google Fit is **not** a programmatic
  source for body composition.
- Operator phone is **Samsung** → RENPHO → **Samsung Health** sync is broader than
  Google Fit (manual: "all categories" enabled). Good for *visibility / stopping photos*;
  weak for a clean *programmatic* pull.
- **Asset we can leverage:** this repo already has a **working Garmin Connect puller**
  (`shared/garmin-fetch.ts` + `shared/garmin-store.ts`, `garmin.env`, `garmin-tools.ts`)
  that reuses the `garminconnect` sidecar. If body composition lands in **Garmin
  Connect**, we extend *this* path — zero new provider, zero new auth.

## Scale options (the "better scale" research)

| Option | New hardware | Programmatic pull | Plumbing impact | Cost |
|---|---|---|---|---|
| **Garmin Index S2** | yes | ✅ native → **Garmin Connect → existing sidecar** (add a `body_composition` fetch) | minimal — reuses built Garmin pipeline | ~$200–300 |
| **Withings / Amp** (US) | yes | ✅ **official Public API** (OAuth + webhooks), weight + full body comp | new OAuth client / new provider | ~$100–130 |
| **Keep RENPHO + Samsung Health** | no | ⚠️ body comp lands in Samsung Health (viewable); programmatic read is fiddly | none (app config only) | $0 |
| **Keep RENPHO → CSV → Garmin Connect** | no | ✅ via OSS upload to Garmin, then the existing sidecar reads it | semi‑manual CSV export + third‑party upload | $0 (time) |

**Recommendation:**
1. **Best reuse of what you already built:** **Garmin Index S2** — body comp is native to
   Garmin Connect, and this repo *already* has the sidecar/auth/tools to pull it. One scale
   swap, minimal new code, most durable.
2. **Cleanest public API / cheapest if you don't want more Garmin:** **Withings / Amp** —
   first‑class public OAuth API.
3. **Zero spend now (stop the photos today):** enable **RENPHO → Samsung Health** so the
   full panel lands in Samsung Health; optionally bridge the same values into Garmin Connect
   via CSV so the existing Sylo pull captures them.

> Decision (Spencer): which scale path? (drives Work Package 2's "feed source".)

## Work Package 1 — rename to `sylo-health` + description cleanup

The news/reddit split already happened (2026‑09‑10). This repo is now *only* health.
Rename + scrub in one coherent pass so the name, folder, loader, and GitHub URL agree.

**In‑repo (description/README scrub done now; `name` + title flip ship atomically with the
folder + loader rename):**
- `package.json` → `name: "sylo-health"`, `description` scrubbed of news/reddit.
- `package-lock.json` → `name` (2 occurrences).
- `README.md` → title `# sylo-health`; delete the "News and Reddit moved out" +
  "All were previously…" paragraphs; remove `README-news.md / README-reddit.md`
  references; drop `test:news` / `test:reddit` from the Tests block; install line →
  `github.com/Yeti-Trix/sylo-health`.
- `host-src/index.ts` (console label) → rebuild `host/index.js` via `npm run build:host`.

**Cross‑repo / system (GATED — needs operator go before touching GitHub/URLs):**
- GitHub: rename repo `Yeti-Trix/sylo-tools-personal` → `sylo-health`; update `origin` URL.
- Local: `mv …\GitHub\sylo-tools-personal` → `…\GitHub\sylo-health`.
- `~/.pi/agent/settings.json` → package path `…\GitHub\sylo-tools-personal` → `…\GitHub\sylo-health`.
- Sylo host (**both** `pi-sylo-public` and `pi-sylo-dev`):
  - `apps/host/src/main/personal-plugin.ts` — add `'sylo-health'` to
    `LEGACY_BUNDLE_NAMES` (≈L75) and the resolution list; point the fallback dir (≈L194) at
    `…\GitHub\sylo-health`.
  - `scripts/bootstrap-pi.mjs` — add `'sylo-health'` to the bundle name groups (≈L95–106).
- Restart the broker; smoke‑test that the `sylo_health_*` tools still load.

## Work Package 2 — body‑comp tracker (design)

**One record per scale session**, structured (not a notes blob), chartable, coachable.

`health/bodycomp/YYYY-MM.ndjson` (new collection in `shared/health-store.ts`, mirroring
`weights`):

```
id, logged_at, date
weight_lb, weight_kg
bmi
body_fat_pct
skeletal_muscle_pct
fat_free_mass_lb
subcutaneous_fat_pct
visceral_fat            # index (e.g. 18)
body_water_pct
muscle_mass_lb
bone_mass_lb
protein_pct
bmr_kcal
metabolic_age
device                  # renpho_es_cs20m | garmin_index_s2 | withings_amp
source                  # operator_photo | readout | garmin | withings | samsung
notes
```

**Store:** `shared/bodycomp-store.ts` mirroring `weight-store.ts`
(insert/update/delete/list‑for‑range/range‑summary/enrich).

**Tools:** `extensions/health/bodycomp-tools.ts` (registered in `extensions/health/index.ts`):
`sylo_health_bodycomp_log / _update / _delete / _list / _summary / _get` — same shape as the
existing `sylo_health_weight_*` family.

**Feed sources (pluggable — depends on the scale decision):**
- `operator_photo` / `readout` — agent logs from the scale screenshot/numbers (works today;
  this is the fallback and the Samsung‑Health option's path).
- `garmin` — extend `shared/garmin-fetch.ts` to also pull `body_composition` from Garmin
  Connect (Garmin Index S2 path; reuses existing auth).
- `withings` — new Withings Public‑API OAuth client + fetch (Amp path).

**UI (later, separate host repo):** a Vitals‑tab chart for weight / body fat % / skeletal
muscle / visceral over time. Data layer ships first.

**Optional profile tie‑in:** surface the latest body comp alongside
`sylo_health_profile_get`, or use a measured BMR instead of the TDEE estimate.

## Rollout order

1. **Now:** enable **RENPHO → Samsung Health** (stop the photos; body comp lands somewhere).
2. **Now (this turn):** description/README scrub of news/reddit (done) + this roadmap.
3. **On your go:** Work Package 1 rename (in‑repo first; GitHub/folder/loader when approved).
4. **Next:** body‑comp data layer + tools (Work Package 2) with the feed source matching
   the scale you pick.
5. **Then:** Vitals‑tab body‑comp charts (host repo).

## Decisions I need (Spencer)

1. **Scale path:** Garmin Index S2 · Withings/Amp · keep RENPHO (+ Samsung Health)?
2. **Rename GO:** approve the gated half (GitHub repo rename + folder move + Sylo host
   loader + settings.json)?
