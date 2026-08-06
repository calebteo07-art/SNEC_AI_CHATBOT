"""Case index for analytics — `case_id -> {pool, set_key, label, difficulty}`.

`case_progress` rows carry a `case_id` and nothing else about the case: no topic, no
discipline. Every cohort aggregation therefore needs this map to bucket an attempt into
a topic group, and the 155 JSONs in `cases/` are the only source of that truth.

Invariant #2 carve-out (no shared in-process state): `_INDEX` is a per-worker, idempotent
READ cache over immutable on-disk case files. It holds no counters, no cross-request
semantics and no user data, so two workers with different cache states still compute
identical answers. It is deliberately NOT `tools.api.shared._case_cache`: that one is
lazily *partial* by construction (one case at a time, on demand) and is wiped at runtime
by `PATCH /api/profile/role` (tools/api/routers/student.py:154) — aliasing it would drop
attempts out of the aggregate at random.

Lifetime is deliberately redeploy-only. Nothing here watches `cases/` for changes, so a
new or edited case JSON is invisible to analytics until the worker restarts — that is the
intended tradeoff, not an oversight, because runtime invalidation is exactly what makes
`tools.api.shared._case_cache` unusable for this purpose (see above). Locally,
`uvicorn --reload` watches only `*.py`, so editing a case JSON will not rebuild the index
until you restart the dev server by hand.

Grouping precedence is production's, verbatim:
`case.get("topic_set") or resolve_set(role, case.get("topic", ""))`
(tools/api/routers/cases.py:334,397). Trainers must see the same groups students do.

This is not a theoretical hazard: while implementing Task 3, bare `resolve_set` was used
to count a set's cases and reported 13 instead of 10, because three cases carry an
explicit `topic_set` that overrides the substring rules —
case_oa_048_history_pain_assessment_aacg (history_taking),
case_psa_035_triage_sudden_painless_vision_loss_crao and
case_psa_036_triage_welder_flash_burn (both triage_referral). Any count, grouping, or
membership list derived without the precedence is wrong in exactly this way, and it is
wrong quietly.
"""
from __future__ import annotations

import asyncio
import logging

from tools.cases.load_case import list_available_cases, load_case
from tools.cases.topic_sets import case_pool, label_for, resolve_set_strict, sets_for

_log = logging.getLogger("eyebot.case_index")

# The roles a case may be authored for. Anything else — including a role-neutral "any" —
# is unclassifiable here, because CLINICAL and OT resolve the same topic to different
# sets, so a role-neutral case has no single correct group. Zero of the 155 cases declare
# "any" today; the real-file coverage test fails CI if one appears, forcing the decision.
_CASE_ROLES = ("OA", "OT", "PSA")

# Whole-build bound. A wedged filesystem must surface as one failed request, never as a
# hung worker.
_BUILD_TIMEOUT_S = 10.0

_INDEX: dict[str, dict] | None = None
_INDEX_LOCK = asyncio.Lock()


def classify_case(case: dict) -> dict | None:
    """Group one case dict; None when it cannot be grouped (fail closed, never bucketed)."""
    case_id = str(case.get("case_id") or "").strip()
    role = str(case.get("role") or "").strip().upper()
    if not case_id or role not in _CASE_ROLES:
        return None
    # An explicit `topic_set` always wins over the keyword rules — 68 of 155 cases carry
    # one, and at least one of them (case_ot_045, hirschberg/krimsky) has a topic the rules
    # do NOT match, so the declared set is the only correct answer for it.
    set_key = case.get("topic_set") or resolve_set_strict(role, str(case.get("topic") or ""))
    if not set_key:
        return None
    set_key = str(set_key)
    # An explicit `topic_set` is trusted content, not a validated enum — a typo or a
    # non-existent key must fail closed here, not sail through as a plausible-looking
    # group (`label_for` will title-case anything, typo included, into a real-looking label).
    if set_key not in {k for k, _ in sets_for(role)}:
        return None
    return {
        "pool": case_pool(role),
        "set_key": set_key,
        "label": label_for(role, set_key),
        "difficulty": str(case.get("difficulty") or "beginner"),
        # The case's OWN topic, not the topic-SET label above. The knowledge x performance
        # map joins stations against flashcard topic_tags ("tonometry", "visual fields"),
        # and the set label ("Diagnostics & imaging") never matches one.
        "topic": str(case.get("topic") or ""),
    }


def _build_case_index() -> dict[str, dict]:
    """SYNC and blocking: re-globs cases/ and reads 155 JSON files off the disk.

    `list_available_cases()` globs on every call and `load_case()` has no cache
    (tools/cases/load_case.py:20,44). Never call this from a coroutine — go through
    `get_case_index()`, which runs it in a worker thread (invariant #1).
    """
    index: dict[str, dict] = {}
    ids = list_available_cases()
    dropped = 0
    for case_id in ids:
        try:
            case = load_case(case_id)
        except Exception:
            dropped += 1
            continue  # one malformed/renamed file must not cost us the other 154
        entry = classify_case(case)
        if entry is None:
            dropped += 1
            continue
        # `classify_case` validated the STRIPPED case_id; key on that same canonical form
        # so a JSON with padded whitespace can't slip in under a key `case_progress.case_id`
        # (which is never padded) can never match.
        index[str(case.get("case_id") or "").strip()] = entry
    if dropped:
        _log.warning("case index dropped %d of %d case files", dropped, len(ids))
    return index


async def get_case_index() -> dict[str, dict]:
    """The case index, built once per worker, off the event loop.

    On a `_BUILD_TIMEOUT_S` timeout, `wait_for` abandons the await and raises — but the
    worker thread underneath `asyncio.to_thread` cannot be force-cancelled, so it keeps
    running to completion in the background and its result is simply discarded when it
    finally returns. Single-flight (the lock below) caps this at one orphaned thread per
    timeout window: a concurrent caller blocks on the same lock instead of starting a
    thread of its own.
    """
    global _INDEX
    if _INDEX is not None:
        return _INDEX
    async with _INDEX_LOCK:
        # Re-check under the lock: a concurrent caller may have published while we waited.
        # Without this, N concurrent cold requests each re-read the whole library.
        if _INDEX is not None:
            return _INDEX
        built = await asyncio.wait_for(
            asyncio.to_thread(_build_case_index), timeout=_BUILD_TIMEOUT_S
        )
        # ONE whole-dict rebind. Never fill a module-level dict in place while other
        # coroutines can read it: a partially populated map silently mis-buckets attempts
        # as unclassified instead of failing loudly.
        _INDEX = built
        return built
