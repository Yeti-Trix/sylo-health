#!/usr/bin/env python3
"""
sylo-health Garmin Connect daily fetcher (Python sidecar).

Logs into Garmin Connect via the unofficial `garminconnect` library (mobile SSO
flow), caches a refresh token, and pulls a day of Venu 4 health metrics. This
is the package-shipped, sidecar-friendly version of the EXP-001 POC, trimmed to
the metrics sylo-health stores.

Usage:
    python garmin_fetch.py 2026-08-11          # human summary + dump file
    python garmin_fetch.py --json 2026-08-11   # raw dump JSON to stdout only

The TS tool (`shared/garmin-fetch.ts`) calls this with `--json` and parses
stdout. First-time login requires an interactive MFA code; run this script by
hand once (without --json) to seed `garmin_tokens.json`, then the sync tool is
non-interactive.

Credentials are read from environment variables (GARMIN_EMAIL, GARMIN_PASSWORD).
dotenv is loaded if available but never overrides existing env values. The TS
caller sets these env vars from the gitignored garmin credentials file.

Endpoints kept (per operator 2026-08-11): resting/max/min HR, HR timeline, HRV,
VO2 max, sleep, SpO2, respiration, stress, steps, distance, floors, calories,
body battery, training readiness, fitness age, HR zones. Dropped: intensity
minutes, hydration, training-status heat acclimation, activities, ECG (not in
lib), blood pressure (no sensor).
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore

HERE = Path(__file__).resolve().parent
TOKEN_STORE = Path(os.environ.get("GARMIN_TOKEN_FILE", HERE / "garmin_tokens.json"))

if load_dotenv is not None:
    # Load .env from the script dir if present (does not override existing env).
    env_file = Path(os.environ.get("GARMIN_ENV_FILE", HERE / ".env"))
    if env_file.exists():
        load_dotenv(env_file)

EMAIL = os.environ.get("GARMIN_EMAIL")
PASSWORD = os.environ.get("GARMIN_PASSWORD")

# (label, method_name) — methods resolved defensively at runtime.
ENDPOINTS: list[tuple[str, str]] = [
    ("stats", "get_stats"),
    ("heart_rates", "get_heart_rates"),
    ("steps", "get_steps_data"),
    ("sleep", "get_sleep_data"),
    ("stress", "get_stress_data"),
    ("hrv", "get_hrv_data"),
    ("respiration", "get_respiration_data"),
    ("spo2", "get_spo2_data"),
    ("training_status", "get_training_status"),  # also carries mostRecentVO2Max
    ("vo2_max_fallback", "get_max_metrics"),
    ("rhr", "get_rhr_day"),
    ("body_battery", "get_body_battery"),
    ("floors", "get_floors"),
    ("training_readiness", "get_morning_training_readiness"),
    ("fitnessage", "get_fitnessage_data"),
    ("user_summary", "get_user_summary"),
    ("hr_zones", "get_heart_rate_zones"),  # account-level, no date arg
]


def login():
    from garminconnect import Garmin

    if not EMAIL or not PASSWORD:
        sys.exit("ERROR: set GARMIN_EMAIL and GARMIN_PASSWORD (env or garmin.env).")

    def prompt_mfa() -> str:
        return input("MFA code: ").strip()

    client = Garmin(EMAIL, PASSWORD, prompt_mfa=prompt_mfa)
    if TOKEN_STORE.exists():
        try:
            client.login(str(TOKEN_STORE))
            return client
        except Exception as e:
            print(f"[auth] cached token rejected ({e}); fresh login...", file=sys.stderr)
    client.login(str(TOKEN_STORE))
    print(f"[auth] logged in; token cached at {TOKEN_STORE.name}", file=sys.stderr)
    return client


def pull_day(client, day: str) -> dict:
    out: dict[str, object] = {}
    for label, method_name in ENDPOINTS:
        fn = getattr(client, method_name, None)
        if fn is None:
            out[label] = {"_skipped": f"method {method_name} not present in lib"}
            continue
        try:
            if method_name in ("get_max_metrics",):
                payload = fn(day)
            elif method_name in ("get_heart_rate_zones",):
                payload = fn()  # no date arg
            else:
                payload = fn(day)
            out[label] = payload
            print(f"  [ok] {label}", file=sys.stderr)
        except Exception as e:
            out[label] = {"_error": f"{type(e).__name__}: {e}"}
            print(f"  [err] {label}: {e}", file=sys.stderr)
    return out


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--json"]
    json_mode = "--json" in sys.argv
    day = args[0] if args else date.today().isoformat()
    datetime.strptime(day, "%Y-%m-%d")  # validate

    print(f"[pull] target day: {day}", file=sys.stderr)
    client = login()
    data = pull_day(client, day)

    if json_mode:
        # Machine-readable: only the raw dump on stdout.
        sys.stdout.write(json.dumps(data, default=str))
        return 0

    dump_path = HERE / f"dump_{day}.json"
    dump_path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    print(f"\n[pull] raw dump -> {dump_path.name}", file=sys.stderr)
    # Human summary on stderr so stdout stays clean if piped.
    hr = data.get("heart_rates") or {}
    print(f"resting HR: {hr.get('restingHeartRate')}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())