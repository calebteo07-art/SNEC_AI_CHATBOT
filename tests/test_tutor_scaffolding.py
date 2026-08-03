"""The tutor has to meet a beginner where they are, then get out of the way.

Branda (2026-08-03): "While the use of Socratic questioning is valuable for promoting
critical thinking and clinical reasoning, it may be challenging for novice learners with
limited or no medical background. A more beginner-friendly approach could involve
providing guided questions, structured prompts, or hints initially, with support
gradually reduced as learners build their knowledge and confidence."

Two things were missing. The nudge budget was a flat TWO for everyone — no fading, and a
bare "what do you reckon?" is not a foothold if you have never seen the word before. And
the persona said to explain clinical terms "only if the student seems unsure", i.e. jargon
by default, which is the opposite of the response column's own answer ("Simplify the
jargons with explanation; use layman language").

The fade needs no new data: `_student_context_block` already puts "Sessions completed: N"
in front of the tutor on every message. These tests pin that coupling in both directions —
a rename on either side silently disarms the scaffolding.
"""
import asyncio
import re

from tools.api.shared import _TUTOR_BASE, _student_context_block, tutor_system

# The literal the persona keys its scaffolding off. It has to survive in BOTH files.
SESSION_LABEL = "Sessions completed"

_PROFILE = {
    "role": "OA", "session_count": 3, "streak": 2, "learning_velocity": "stable",
    "retention_scores": {}, "weak_topics": [], "missed_findings": [],
}


def _ctx(**over) -> str:
    """The real profile block, without touching Supabase (profile is passed in)."""
    return asyncio.run(_student_context_block("S1", profile={**_PROFILE, **over}))


# ── the jargon half ────────────────────────────────────────────────────────────────

def test_clinical_terms_are_explained_by_default_not_on_suspicion():
    assert not re.search(r"only if the student seems unsure", _TUTOR_BASE, re.I), (
        "jargon is still explained only on suspicion — that is the defect"
    )
    assert re.search(r"(plain|lay|everyday)\s+(english|language|words)", _TUTOR_BASE, re.I), (
        "the persona must ask for a plain-language gloss"
    )
    assert re.search(r"first time|first use|whenever you (use|introduce)", _TUTOR_BASE, re.I), (
        "the gloss must be tied to first use, or it becomes either never or every time"
    )


def test_the_term_itself_is_still_taught():
    """Plain language must not mean dropping the vocabulary they are examined on."""
    assert re.search(r"IOP|cup-disc|RAPD", _TUTOR_BASE), "the real terms must still be used"


# ── the scaffolding half ───────────────────────────────────────────────────────────

def test_persona_keys_scaffolding_off_the_session_count():
    assert SESSION_LABEL in _TUTOR_BASE, (
        f"the persona must name {SESSION_LABEL!r} — it is the only experience signal it gets"
    )


def test_the_profile_block_actually_emits_that_label():
    """The coupling, asserted from the other side: rename it here and the rule above
    silently stops matching anything, with no test failing anywhere else."""
    assert SESSION_LABEL in _ctx(), f"the student context block no longer emits {SESSION_LABEL!r}"


def test_a_beginner_gets_a_structured_nudge_not_an_open_question():
    beginner = _TUTOR_BASE.lower()
    assert re.search(r"narrow|either/or|two options|point them|concrete|give them a start", beginner), (
        "a beginner nudge must narrow the field, not just ask an open question"
    )


def test_support_fades_rather_than_being_fixed_at_two_nudges():
    """Branda's actual ask: 'support gradually reduced'. A beginner gets the answer sooner."""
    assert re.search(r"\bone nudge\b|a single nudge|after ONE", _TUTOR_BASE, re.I), (
        "beginners must reach the answer in fewer nudges than the experienced two"
    )
    assert re.search(r"at most TWICE|twice", _TUTOR_BASE), (
        "the experienced ceiling of two nudges must survive"
    )


def test_an_unknown_profile_falls_back_to_the_supported_side():
    """`get_profile` returns a default profile on ANY error, and the block is empty when
    the fetch fails outright — the tutor must not read that as 'experienced'."""
    assert re.search(r"(if|when) you (cannot|can't|do not|don't) see.{0,80}(beginner|new|scaffold)",
                     _TUTOR_BASE, re.I | re.S), (
        "with no session count the tutor must default to the beginner treatment"
    )


def test_a_brand_new_student_reads_as_zero_not_as_missing():
    assert f"{SESSION_LABEL}: 0" in _ctx(session_count=0)


# ── guarantees an edit here must not cost ──────────────────────────────────────────

def test_the_one_message_one_thing_rule_survives():
    assert "NEVER put a nudge and an answer in the same message" in _TUTOR_BASE


def test_the_chat_register_survives():
    assert re.search(r"markdown headers", _TUTOR_BASE, re.I)
    assert re.search(r"lah|leh|lor", _TUTOR_BASE), "the Singlish-particle ban must stay"


def test_grounding_survives():
    assert re.search(r"never invent clinical facts", _TUTOR_BASE, re.I)


def test_role_context_still_rides_along():
    assert "Ophthalmic Technician" in tutor_system("OT")
    assert _TUTOR_BASE in tutor_system("OT")
