"""Flashcard `topic_tag` -> case set-key group. Pure data + one function, no I/O.

`flashcard_attempts.topic_tag` carries FLASHCARD topic keys (45, defined in
tools/flashcards/flashcard_sets.py:26-79). OSCE aggregation groups by CASE set
keys (21, defined in tools/cases/topic_sets.py:17-69). The namespaces are
DISJOINT, and `topic_sets.resolve_set` cannot say "no match" — it falls through
its ordered substring rules to `_DEFAULT` (topic_sets.py:168), so a flashcard tag
handed to it is silently absorbed:

    resolve_set("OA", "anatomy_physiology") -> "history_taking"
    resolve_set("OT", "hrt")                -> "screening"

Whole knowledge families would then be ranked as weak *procedural* sets. Hence an
EXPLICIT map, never a derived one. tests/content/test_topic_crosswalk.py iterates
every key in both taxonomies, so new content fails CI rather than vanishing.

To add a new topic: resolve it against the live case library, not its name —
check which set_key's OSCE cases (tools/cases/topic_sets.py SET_LABELS, cases/
JSON) actually cover the content, and map to that. If it spans multiple pools
or no station examines it, map it to its own "knowledge_<topic>" group instead.
"""
from __future__ import annotations

from tools.flashcards.flashcard_sets import DIFFICULTIES

# Namespace prefix for every flashcard-only group (no OSCE counterpart). No real
# case set_key may start with it — test_no_real_set_key_uses_the_knowledge_prefix
# pins that — so a plain prefix check (is_knowledge_group) tells an OSCE-backed
# group apart from a flashcard-only one without hand-syncing a membership set.
KNOWLEDGE_PREFIX: str = "knowledge_"

# The shared catch-all under that namespace: cross-cutting tags that don't carry
# enough standalone content to deserve their own group (the DB's legacy column
# default, notation drilled across every role). Named rather than inlined so the
# fallback contract in flashcard_group() reads clearly at the call site.
KNOWLEDGE_GROUP: str = "knowledge_general"

# flashcard topic_key -> case set_key | "knowledge_*" group.
FLASHCARD_TO_SET: dict[str, str] = {
    # --- FOUNDATIONS (12) -> one knowledge group per topic ----------------------
    # Shared knowledge layer studied by EVERY role (flashcard_sets.py:88-90), with
    # no single-pool OSCE counterpart to point at. Before this split, these 12
    # topics plus `abbreviations` (below) all shared one bucket: 650 cards, 28.9%
    # of the whole 2250-card flashcard bank, behind a single unactionable row —
    # e.g. a genuine pharmacology weakness was invisible once averaged against
    # anatomy, ethics, systemic disease and the rest of that bucket, and a
    # 13-topic mean structurally regresses toward the cohort average, so the
    # largest slice of the bank could never surface in a "weakest topics"
    # ranking. Each FOUNDATIONS topic is instead identity-mapped to its own
    # "knowledge_<topic>" group (`abbreviations` still shares the general
    # bucket below — it's notation, not a knowledge domain).
    # `ocular_emergencies` additionally gets a pool override below: it is the
    # largest CLINICAL set in the live case library (13 cases — chemical/
    # penetrating injury, hyphaema, acute angle-closure glaucoma, CRAO, and
    # red-flag triage variants) and the only one of the 21 set keys with no
    # flashcard topic mapped to it by default; OA/PSA sit a real station for
    # it, OT does not.
    "anatomy_physiology": "knowledge_anatomy_physiology",
    "microbiology_infection": "knowledge_microbiology_infection",
    "pharmacology": "knowledge_pharmacology",
    "ocular_emergencies": "knowledge_ocular_emergencies",
    "professional_ethics": "knowledge_professional_ethics",
    "disorders_eyelid_lacrimal_orbit": "knowledge_disorders_eyelid_lacrimal_orbit",
    "disorders_cornea_conjunctiva": "knowledge_disorders_cornea_conjunctiva",
    "disorders_lens_cataract": "knowledge_disorders_lens_cataract",
    "disorders_uvea_retina": "knowledge_disorders_uvea_retina",
    "glaucoma": "knowledge_glaucoma",
    "neuro_strabismus": "knowledge_neuro_strabismus",
    "systemic_disease": "knowledge_systemic_disease",

    # --- CLINICAL (14) -> CLINICAL set keys ------------------------------------
    "red_eye": "red_eye",
    "triage": "triage_referral",
    "history_taking": "history_taking",
    "distance_va": "visual_acuity",       # the OSCE set is "Visual Acuity & Refraction"
    "near_vision": "visual_acuity",
    "pinhole": "visual_acuity",
    "iop_nct": "tonometry_iop",
    "eye_drops": "eye_drops",
    "pupil_dilation": "pupil_dilation",
    "colour_vision": "colour_macular",    # the OSCE set is "Colour Vision & Amsler"
    "amsler_macula": "colour_macular",
    "fall_risk": "fall_risk",
    "perioperative": "perioperative",
    # Cross-cutting notation drilled for every role; no station examines it.
    "abbreviations": KNOWLEDGE_GROUP,

    # --- OT (19) -> OT set keys -------------------------------------------------
    "oct_macula": "oct_imaging",
    "oct_rnfl": "oct_imaging",
    "hvf": "visual_fields",
    "gvf": "visual_fields",
    "ascan_biometry": "biometry",
    "optical_biometry": "biometry",
    "endothelial": "anterior_segment",
    "asoct": "anterior_segment",
    "flare": "anterior_segment",
    "corneal_topography": "corneal_topography",
    "pam": "precataract_pam",
    # HRT is confocal scanning-laser tomography of the optic nerve head, i.e.
    # structural posterior-segment imaging — it belongs with the OCT stations.
    # resolve_set has no `hrt` rule and would dump it in `screening` via _DEFAULT.
    "hrt": "oct_imaging",
    "orthoptics": "orthoptics",
    "dayward_theatre": "dayward_theatre",
    "auto_refraction": "refraction_acuity",
    "aberrometry": "refraction_acuity",
    "lens_meter": "refraction_acuity",
    "retinal_imaging": "oct_imaging",
    "dr_grading": "screening",            # SORC grading is the screening station

    # --- Legacy / default column value ----------------------------------------
    # migration 010 declares `topic_tag TEXT NOT NULL DEFAULT 'general'`
    # (010_flashcard_attempts.sql:14) and the card serialiser falls back to it
    # (tools/api/routers/student.py:331,341). Real rows carry it; map it explicitly.
    "general": KNOWLEDGE_GROUP,
}

# (pool, flashcard_topic_key) -> case set_key, consulted after suffix-stripping
# and before FLASHCARD_TO_SET. Exists for a deck studied by EVERY role (so
# FLASHCARD_TO_SET routes it to a knowledge group by default) that nonetheless
# has a real OSCE station in exactly ONE pool. Only takes effect when the
# caller passes that pool explicitly — the pool-less lookup (pool=None) always
# uses the knowledge default, since it has no way to know which pool's answer
# would be correct.
POOL_OVERRIDES: dict[tuple[str, str], str] = {
    ("CLINICAL", "ocular_emergencies"): "ocular_emergencies",
}

_DIFFICULTIES: frozenset[str] = frozenset(DIFFICULTIES)


def is_knowledge_group(group: str) -> bool:
    """True when `group` is a flashcard-only knowledge bucket, never a real case
    set_key. Downstream needs to tell OSCE-backed groups apart from
    knowledge-only ones (e.g. to skip an OSCE-accuracy column that has no data
    by construction) — a prefix check beats a membership set that would need
    hand-syncing against FLASHCARD_TO_SET on every edit."""
    return group.startswith(KNOWLEDGE_PREFIX)


def _strip_difficulty(topic_tag: str) -> str:
    """Normalise one `topic_tag`, stripping a trailing "__<difficulty>" if
    present. Flashcards build set keys as "<topic>__<difficulty>"
    (flashcard_sets.py:93) and either form can reach the column. Only a KNOWN
    difficulty is stripped, and `split_set_key` is deliberately not reused —
    its bare `rpartition("__")` returns ("", "", tag) for a plain topic key,
    which would blank every unsuffixed tag."""
    tag = (topic_tag or "").strip().lower()
    head, sep, tail = tag.rpartition("__")
    if sep and head and tail in _DIFFICULTIES:
        return head
    return tag


def flashcard_group(topic_tag: str, pool: str | None = None) -> str:
    """Bucket one `flashcard_attempts.topic_tag` into a topic group.

    `pool` is the case-pool namespace ("CLINICAL" or "OT" — i.e.
    `case_pool(role)` from tools/cases/topic_sets.py) that the caller is
    rendering a view for. It is optional and defaults to None (the "all
    disciplines" view): a handful of FOUNDATIONS decks are studied by every
    role but examined by a station in only ONE pool (see POOL_OVERRIDES, e.g.
    `ocular_emergencies`), so the tag can only resolve to that station's
    set_key once the caller says which pool it's asking on behalf of. Callers
    with no single pool in scope get the safe default — the knowledge group.

    Unknown tags fall back to KNOWLEDGE_GROUP, never to an OSCE-backed set: a
    stray tag must not be able to move a procedural group's accuracy. Every
    real topic is an explicit key in FLASHCARD_TO_SET, enforced by
    tests/content/test_topic_crosswalk.py.
    """
    tag = _strip_difficulty(topic_tag)
    if pool is not None:
        override = POOL_OVERRIDES.get((pool, tag))
        if override is not None:
            return override
    return FLASHCARD_TO_SET.get(tag, KNOWLEDGE_GROUP)


def is_known_tag(topic_tag: str) -> bool:
    """True when `topic_tag`, after stripping a difficulty suffix, is an
    explicit key in FLASHCARD_TO_SET.

    `topic_tag` is client-supplied and unvalidated, and flashcard_attempts only
    started accruing rows when Task 1 shipped, so there is no historical
    baseline to diff against. A stale frontend build, a topic rename, or a
    refactor that starts sending `set_key` instead would silently route every
    attempt into the knowledge bucket — the panel would still render, just
    plausibly and entirely wrong. Task 8 counts `is_known_tag() is False` hits
    alongside the totals it already reports so that drift is observable
    instead of silent.
    """
    return _strip_difficulty(topic_tag) in FLASHCARD_TO_SET
