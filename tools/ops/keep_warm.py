#!/usr/bin/env python3
"""Keep-warm pinger — kills the Render free-tier cold start (becky §7).

The single uvicorn worker on Render free spins down after ~15 min idle; the first
request after a lull then eats a multi-second cold boot regardless of model speed.
This is the LARGEST real-latency event in the app, so removing it is becky Tier-1 #1.

The fix is purely infra: hit a cheap, unauthenticated, side-effect-free endpoint on a
schedule so the instance never goes idle. `/api/status` is ideal — it returns only
`{"status":"ok","mock_mode":...}`: no DB, no AI call, no data, nothing to leak (the
becky security note for the keep-warm endpoint).

This script does ONE ping and exits 0 (warm) / 1 (failed) — wire it to any external
scheduler. It must run from OUTSIDE the app (if the app is asleep, nothing inside it
can ping it). Recommended free options, in order:

  1. UptimeRobot (free): HTTP(s) monitor on https://<your-app>/api/status every 5 min.
     Zero code, also gives uptime alerts. This is the recommended approach.
  2. cron-job.org (free): same idea, GET https://<your-app>/api/status every 5-10 min.
  3. GitHub Actions schedule (this script): a workflow on `*/10 * * * *` running
       python tools/ops/keep_warm.py --url https://<your-app>/api/status
  4. Self-host the loop:  python tools/ops/keep_warm.py --url <...> --loop --interval 600

NOTE: Render free spins the instance down regardless; a pinger keeps it up only while
the pinger runs. The fully robust fix is the paid "always-on" tier — keep-warm is the
free mitigation. Pinging every ~5-10 min is enough; don't hammer it.

Usage:
    python tools/ops/keep_warm.py --url https://<your-app>/api/status
    python tools/ops/keep_warm.py --url https://<your-app>/api/status --loop --interval 600
"""
from __future__ import annotations

import argparse
import sys
import time
import urllib.request


def ping(url: str, timeout: float = 30.0) -> bool:
    """Return True if the endpoint responded 2xx. Never raises."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "eyebot-keepwarm/1"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            ok = 200 <= resp.status < 300
            print(f"[keep-warm] {url} -> {resp.status} {'OK' if ok else 'UNEXPECTED'}", flush=True)
            return ok
    except Exception as exc:  # noqa: BLE001 — a failed ping must never crash the scheduler
        print(f"[keep-warm] {url} -> FAILED: {type(exc).__name__}: {exc}", flush=True)
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Keep-warm pinger for the EyeBot API (becky §7).")
    parser.add_argument("--url", required=True, help="Health URL, e.g. https://<app>/api/status")
    parser.add_argument("--loop", action="store_true", help="Ping forever (self-hosted scheduler).")
    parser.add_argument("--interval", type=int, default=600, help="Seconds between pings in --loop mode.")
    parser.add_argument("--timeout", type=float, default=30.0, help="Per-request timeout (cold boot can be slow).")
    args = parser.parse_args()

    if not args.loop:
        return 0 if ping(args.url, args.timeout) else 1

    print(f"[keep-warm] looping every {args.interval}s — Ctrl-C to stop", flush=True)
    while True:
        ping(args.url, args.timeout)
        time.sleep(max(60, args.interval))


if __name__ == "__main__":
    sys.exit(main())
