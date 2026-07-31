# Shared cohort reads + per-student mastery inputs — Design

**Date:** 2026-07-31
**Status:** Approved design → ready for implementation plan
**Basis:** full read of the three whole-table consumers in a worktree off `main`
(`8b70865`). Follows P2b's student-detail mastery block, shipped `1e2e57f` / `8b70865`.

## 1. Goal

Three admin features independently read the same three whole tables. Make them share
**one cache of the raw reads**, and make a student's own mastery figures come from the
**per-student reads already on their page** so the number that moves when they act is
never stale against the panel beside it.

Two changes, two commits:

1. **`tools/supervisor/cohort_reads.py`** — one 45s read cache under all three consumers.
2. **`mastery_block`'s inputs** — own values from per-student reads, cohort scans reduced
   to the peer aggregate and the membership gate.

## 2. Why — the audit

### 2.1 The three consumers

`db.get_active_student_profiles()` + `db.get_all_case_scores()` +
`db.get_all_flashcard_attempts()` are read by exactly three call sites, verified by grep
across `tools/`:

| Consumer | Caches | What it caches |
|---|---|---|
| `tools/supervisor/at_risk.py:128` | `_cache` + `_refresh_lock`, 45s, single key | its derived flagged-student list |
| `tools/api/routers/admin.py:405` (cohort-analytics) | `_cohort_cache`, 45s, per `(discipline, days)` | its derived topic-group payload |
| `tools/api/routers/admin.py:754` (`admin_student_detail`) | **none** | — |

`admin_student_detail` therefore performs all three whole-table scans on **every student
a trainer opens**, and `useStudentDetail` carries the shared `LIVE` config
(`refetchInterval: 30_000`, `refetchOnWindowFocus`, `frontend/src/hooks/useAdmin.ts:9`),
so the detail query background-refetches. A trainer reviewing 10 students costs ~60
scans. Prod is one uvicorn worker on Render free, and `flashcard_attempts` is the
product's highest-volume table.

`shared_limit("30/minute", scope="admin_student_detail")` bounds it per trainer and the
reads are async, so this is a **latency and egress** problem, not a stalled-worker one.

### 2.2 Why the obvious fix is wrong

Caching `admin_student_detail`'s three reads for 45s makes the student's own
`mastery.*.value` stale — those values are derived from the cohort scans — while the
`cases` list rendered directly below comes from the *uncached* per-student
`db.get_case_results`. A student finishes a station, the trainer refreshes, and the page
shows the new attempt in one panel and the pre-attempt mastery figure in another. A
visibly self-contradictory page is worse than a uniformly stale one.

A fourth sibling cache over a fourth derived output is the wrong shape regardless: the
three *raw* reads are byte-identical for every student, and that is the layer worth
sharing.

### 2.3 Verified state

- **Nothing renders `mastery` yet.** No `mastery` / `cohort_avg` / `peers_n` consumer
  exists in `frontend/src/`, and `StudentDetail` (`useAdmin.ts:103`) does not declare the
  field. The contradiction in §2.2 is **latent**, not live — which makes it cheap to fix
  now and means neither commit needs frontend work.
- **`leave_one_out` and `_peers_n` are used only inside `mastery.py`** and its direct
  tests. Nothing else imports them.
- **`get_profile(student_id)` returns the raw `student_profiles` row** (`select("*")`), so
  `retention_scores` and `role` are the same shape the cohort scan yields per student. It
  **never raises** — on a read failure it returns a default profile
  (`retention_scores: {}`, `role: ""`).
- **`db.get_case_results(student_id)`** is `select("*").eq("student_id", …)`, so its rows
  carry `student_id` and feed `osce_by_student` unchanged.
- **`db.get_topic_accuracy(student_id)`** aggregates the student's raw attempts into
  `{topic: {correct, total, pct}}` and **raises** on a missing `flashcard_attempts` table;
  the handler already catches that to `{}`.
- `tests/conftest.py::_reset_shared_api_state` already resets `_case_cache`, the check-in
  `_question_cache`, `_cohort_cache` and `at_risk._cache` per test.

## 3. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Cache layer | **One shared cache of the RAW reads**, not of derived output. The rows are byte-identical for every student; the derived outputs are not |
| D2 | Existing derived caches | **Both kept.** The read cache saves egress and latency, not CPU — each derived cache still keeps a full-table Python bucketing pass off the event loop on every poll (invariant #1) |
| D3 | Failure split | Carried **inside** the bundle, unchanged per source: profiles + cases **fail closed** (raise), flashcards **degrade** to `[]` + `flashcard_ok=False` |
| D4 | Caching a failure | A flashcard-failed bundle **is** cached; a profiles/cases failure is **not** |
| D5 | TTL | 45s, matching both existing caches. `_READ_TTL_S = 0` disables read **and** write, the convention `_CACHE_TTL_S` / `_COHORT_TTL_SECONDS` already use |
| D6 | Single-flight | In the shared module. `at_risk._refresh_lock` is **kept** (D2) but re-documented — it no longer serialises reads |
| D7 | Return identity | **Shallow list copies** per call, for the reason `at_risk._fresh()` already gives: one consumer sorting or popping a returned list would poison every hit for the rest of the TTL. Row dicts are shared and read-only by contract |
| D8 | `mastery_block` signature | **`mastery_block(own, peers)`**, `peers` already excluding the student. `leave_one_out` and `_peers_n` are deleted as orphans of this change |
| D9 | Peer mean | Computed by **excluding the student by id**, never by subtracting their value from a total that includes them (§5.1) |
| D10 | Own values | Sourced from the three per-student reads **already on the page**; the cohort scans feed only the peer aggregate and the membership gate |
| D11 | Frontend | **No change.** The block is unrendered (§2.3) |
| D12 | Ship | Two commits: read cache (no output change), then mastery inputs (semantics) |

## 4. Part 1 — `tools/supervisor/cohort_reads.py`

### 4.1 Contract

```python
async def get_cohort_reads() -> CohortReads
```

returning a frozen dataclass carrying `profiles`, `staff_excluded`, `case_rows`,
`card_rows`, `flashcard_ok`. Named fields, not a tuple: five positional values unpacked
at three call sites is how a caller silently swaps `staff_excluded` for `flashcard_ok`.

- **profiles + cases fail closed** — `get_cohort_reads()` raises. Every caller's existing
  `try` still produces its own current outcome: 500 for cohort-analytics, propagate for
  at-risk, `mastery: null` for student detail. No caller's failure behaviour changes.
- **flashcards degrade** — the bundle absorbs the exception, sets `card_rows = []` and
  `flashcard_ok = False`. `flashcard_ok` is load-bearing: it is the only thing keeping
  `sources.flashcard: "unavailable"` distinguishable from a genuinely empty table, which
  is the P1 "an outage must not render as a confident 0%" doctrine.
- **D4, cache-a-degrade:** a missing `flashcard_attempts` table is the documented *normal*
  pre-migration-010 state (`db.py:565-568`), so refusing to cache that bundle would defeat
  the cache on the common path. A profiles/cases failure is a real outage and must retry.
  Cost: a transient flashcard blip pins "unavailable" across all three surfaces for up to
  45s. Accepted — it is the same reading a single request would have got.
- Cache shaped `_cache["all"] = (monotonic_ts, bundle)`, deliberately identical to
  `at_risk._cache` so the conftest reset block is a copy of the existing one.

### 4.2 Consumer wiring

Each consumer swaps its three `await db.…` calls for one `await get_cohort_reads()` and
keeps everything else — including its own `try`/degrade and its own derived cache (D2).
`admin_cohort_analytics` reads `flashcard_ok` where it currently sets
`flashcard_source = "unavailable"` in its own `except`.

`at_risk`'s `_refresh_lock` docstring currently claims to stop two concurrent callers from
duplicating the table scans. That is now false — the layer below owns it. It is
re-documented as serialising the derived recompute. Leaving a load-bearing rationale
comment describing behaviour that moved is the failure mode this codebase's comment
density exists to prevent.

### 4.3 Bounds

Resident set is one copy of the three tables per worker for 45s, versus today's up to
three concurrent per-request copies — strictly better than the status quo. `_fetch_all`
already caps each read at 50 × 1000 rows.

Staleness stacks: a derived cache filled at t=0 from a bundle fetched at t=−44 makes
at-risk and cohort-analytics up to 90s old. Both are cohort baselines with no
per-student freshness contract, so this is acceptable; §5 is where freshness matters.

## 5. Part 2 — mastery inputs

### 5.1 Why the peer mean stops using subtraction

`leave_one_out(total, n, value)` derives the peer mean by subtracting the student's own
value from a cohort total that includes them. That is exact only while both numbers come
from the same read. Once the own value is fresh and the total is up to 45s stale, the
subtraction corrupts the result: a student whose cached OSCE value was 60 and whose fresh
value is 80, in a `total=180, n=3` cohort, yields `(180−80)/2 = 50` peers instead of the
true `60`, and can go negative in a thin cohort.

So `peers` is built by **excluding the student by id** and `cohort_avg` is a plain mean
over the peer rows. The leave-one-out doctrine — and every reason for it in `mastery.py`'s
docstring — survives intact; it is achieved by construction instead of arithmetic, which
makes the mixed-freshness bug structurally impossible rather than merely absent.

### 5.2 Signature

```python
mastery_block(own: dict, peers: dict[str, dict]) -> dict
```

- `own` — `{"osce": float|None, "flashcard": float|None, "retention": float|None}`.
- `peers` — `{student_id: {same three keys}}`, the viewed student already removed.
- Per scale, read with `.get(scale)` on both sides, never `[scale]` — a row carrying only
  the scales it has is the existing contract (`test_mastery.py` passes `{"osce": 0.0}`),
  and the current implementation already uses `.get`.
- `present = [row.get(scale) for row in peers.values() if row.get(scale) is not None]`;
  `cohort_avg = round(mean(present), 1) if present else None`; `peers_n = len(present)`;
  `cohort_n = peers_n + (1 if own value is not None else 0)`; `delta` unchanged — null
  unless both sides exist.
- `cohort_n` keeps its documented meaning ("students who HAVE the scale, including this
  student") and stays honest under a fresh own value: a student whose first attempt lands
  after the cached scan counts themselves in immediately.
- `leave_one_out` and `_peers_n` are deleted (D8). Their four direct tests fold into the
  new peer-mean tests, preserving each assertion's intent.

### 5.3 Own values come from reads already on the page

| scale | own value | source, already read at |
|---|---|---|
| osce | `osce_by_student(case_rows).get(sid, {}).get("avg_score")` | `db.get_case_results` — the same list that renders `cases` |
| flashcard | `flashcard_accuracy(flashcard_acc)` | `db.get_topic_accuracy` — the same dict that renders `flashcard_accuracy` |
| retention | `retention_mastery(profile["retention_scores"], role=profile["role"])` | `get_profile` — the same row that renders `retention_scores` |

No new read is added. `osce_by_student` and `retention_mastery` are the functions the
cohort path already uses, so own and peer values stay on one definition.

`flashcard_accuracy(topic_acc)` is new and goes in `cohort_analytics.py` **directly beside
`flashcard_by_student`**: whole-bank `round(100 * Σcorrect / Σtotal, 1)`, `None` at a zero
denominator. Same file, adjacent, with a comment binding the two — the `_score_rank`
precedent, so the peer definition and the own definition cannot drift.

The cohort scans now feed **only** the peer aggregate and the membership gate.

### 5.4 The invariant this buys

**Every mastery `value` derives from a read whose raw form is on the same page.** The
number that moves when a student acts moves together with the panel below it; only the
peer baseline lags, which is what a baseline is for.

### 5.5 Degrade paths

- Membership gate unchanged in intent: the student must appear in the cohort profiles, or
  `mastery` is `null` ("not in this population", not "no data"). The id set is computed
  from the profiles read, gated on, and only then are peers built.
- **New, accepted:** a student approved less than 45s ago is absent from the cached
  population, so `mastery: null` until the TTL rolls. Self-healing, and they have no data
  to compare yet.
- `get_profile` never raises; on a failed read it returns `retention_scores: {}`,
  `role: ""`, so retention reads as "no data". The rendered `retention_scores` panel is
  fed from the same dict, so the page stays self-consistent even then.
- `get_topic_accuracy` raising on a missing table is already caught to `{}` → own
  flashcard value `None`, never `0.0`.
- The existing broad `except` → `audit_log("mastery_block_failed", …)` → `mastery = None`
  stays; a bug in the pure scorers must not blank the page they decorate.

## 6. Testing

TDD: failing test first, minimal fix, then mutation-test each new test by breaking the
fix it guards. `MOCK_MODE` is automatic (no `GEMINI_API_KEY`); **no `db.*` call is left
unstubbed in an endpoint test** — conftest's global `_forbid_real_supabase` fails the test
on the way out, but an unstubbed call still aborts the read it belonged to and the
handler's degrade would hide that as `mastery: null`.

### 6.1 Part 1 — `tests/supervisor/test_cohort_reads.py`

- Two calls inside the TTL perform **one** set of db reads (call counts on the stubs).
- Different consumers share the one cache.
- `_READ_TTL_S = 0` disables read and write.
- A profiles/cases failure propagates and is **not** cached — the next call retries.
- A flashcard failure yields `flashcard_ok=False`, `card_rows=[]`, and **is** cached.
- Two concurrent awaits on a cold cache produce one read (single-flight).
- Mutating a returned list does not poison the next hit (D7).

### 6.2 Part 1 — endpoint-level

- `/cohort-analytics` then `/student/{id}/detail` makes **one**
  `get_all_flashcard_attempts` call, not two. This is the regression test for §2.1 and it
  fails today.
- Each consumer's degrade behaviour is unchanged: cohort-analytics still 500s on a failed
  cases read, still reports `sources.flashcard: "unavailable"`; at-risk still propagates;
  student detail still emits `mastery: null`.

### 6.3 Part 1 — conftest registration

A direct test that warms `cohort_reads._cache` and asserts `_reset_shared_api_state()`
empties it. Order-independent, so an unregistered cache cannot silently serve one test's
stubbed rows to every later test in the process — the failure mode that has bitten this
suite before.

### 6.4 Part 2

- Pure: `mastery_block(own, peers)` — peer mean excludes the student by construction;
  `cohort_n` / `peers_n` under a fresh own value the peers have never seen; a scale the
  student lacks stays `None` with the cohort still shown; the four `leave_one_out` cases
  re-expressed against the new shape.
- Pure: `flashcard_accuracy` — whole-bank figure, `None` at a zero denominator, and
  agreement with `flashcard_by_student` on the same underlying rows.
- **The sharp one:** warm the cohort cache with pre-attempt rows, add an attempt to the
  per-student read only, and assert `cases` and `osce_mastery.value` move **together** in
  the same response. This is the direct regression test for the contradiction §2.2
  describes, and it must fail if own values are ever re-sourced from the cohort scan.
- Same shape for the other two scales: `flashcard_accuracy` vs `flashcard_mastery.value`,
  `retention_scores` vs `retention_mastery.value`.

### 6.5 Existing tests that change

`tests/api/test_admin_student_detail.py` stubs `get_case_results → []` and
`get_topic_accuracy → {}` while asserting `osce_mastery.value == 90.0` from the *cohort*
fixture. Those fixtures must now carry s1's own rows. Every assertion's intent is
preserved — three named scales, peer mean excludes the student, both degrade paths, the
fixed rate-limit scope, the off-cohort gate — and only the source of s1's own numbers
moves. Called out explicitly because editing assertions to match new behaviour is exactly
how a real regression hides.

## 7. Out of scope

- Any frontend work, including typing or rendering `mastery` (D11).
- Retiring either derived cache (D2).
- Pushing aggregation into SQL/RPC — still the P4 seam `cohort_analytics`'s docstring
  describes.
- `at_risk`'s own scoring semantics; it gains the shared read cache and nothing else.

## 8. Success criteria

1. `/cohort-analytics` + `/student/{id}/detail` in one TTL window perform **one** set of
   three table reads, proven by a call-count test.
2. Every consumer's failure and degrade behaviour is byte-identical to today.
3. A student's three mastery `value`s always agree with the raw panels on the same page,
   proven by a test that moves a per-student read while the cohort cache stays warm.
4. The peer mean is never computed by subtracting the student's own value.
5. `python -m pytest -q` green before either push.
