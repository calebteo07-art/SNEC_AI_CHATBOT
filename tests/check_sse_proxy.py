#!/usr/bin/env python3
"""Phase-0 migration gate: prove SSE streams traverse the Next.js proxy
unbuffered.

The backend's dev-only /api/dev/sse-test endpoint emits 5 chunks at 300 ms
intervals. If the proxy buffers, all chunks arrive at once and the gate fails.

Usage:
    python tests/check_sse_proxy.py [url]
    # default url: http://127.0.0.1:3000/api/dev/sse-test  (through Next)
"""
import sys
import time
import urllib.request

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000/api/dev/sse-test"

start = time.time()
arrivals: list[float] = []

req = urllib.request.Request(URL, headers={"Accept": "text/event-stream"})
with urllib.request.urlopen(req, timeout=20) as res:
    while True:
        line = res.readline()
        if not line:
            break
        if line.startswith(b"data:"):
            arrivals.append(time.time() - start)

gaps = [arrivals[i + 1] - arrivals[i] for i in range(len(arrivals) - 1)]
distinct = sum(1 for g in gaps if g >= 0.2)

print(f"url:          {URL}")
print(f"chunks:       {len(arrivals)}")
print(f"first chunk:  {arrivals[0]:.3f}s" if arrivals else "first chunk:  none")
print(f"gaps:         {[f'{g:.3f}s' for g in gaps]}")
print(f"distinct gaps >= 200ms: {distinct}")

assert len(arrivals) == 5, f"expected 5 chunks, got {len(arrivals)}"
assert arrivals[0] < 1.0, f"first byte {arrivals[0]:.3f}s — too slow, proxy likely buffering"
assert distinct >= 3, "chunks arrived together — proxy is buffering the stream"
print("SSE GATE: PASS")
