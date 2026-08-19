"""Role scope — the one definition of what an OA/OT/PSA student studies.

The content model is TWO pools, not three: every role studies the shared FOUNDATIONS
pool plus its own procedural pool, and OA and PSA resolve to the same procedural pool
(CLINICAL). So OA and PSA have byte-identical scope and differ ONLY by job title.

The tutor used to state that scope in a HAND-WRITTEN dict, duplicated verbatim in
tools/api/shared.py and tools/api/routers/student.py — and the two copies disagreed
with the content model, giving OA and PSA different teaching emphasis over an
identical pool. These tests pin the derivation so prose and pool cannot drift again.
"""
import re
from pathlib import Path

import pytest

from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS
from tools.shared.role_scope import ROLE_TITLES, bare_key, in_scope, role_focus

CLINICAL = [label for _, label in FLASHCARD_TOPICS["CLINICAL"]]
OT = [label for _, label in FLASHCARD_TOPICS["OT"]]
FOUNDATIONS = [label for _, label in FLASHCARD_TOPICS["FOUNDATIONS"]]


def _body(role: str) -> str:
    """The focus line minus its first line (the title)."""
    return role_focus(role).split("\n", 1)[1]


# ── The invariant this module exists for ──────────────────────────────────

def test_oa_and_psa_scope_is_byte_identical():
    assert _body("OA") == _body("PSA")


def test_oa_and_psa_still_carry_their_own_title():
    """Same scope, different job. Collapsing the titles too would misname the student."""
    oa_title, psa_title = role_focus("OA").split("\n")[0], role_focus("PSA").split("\n")[0]
    assert oa_title != psa_title
    assert "Ophthalmic Assistant (OA)" in oa_title
    assert "Patient Service Associate (PSA)" in psa_title


def test_ot_scope_differs_from_oa():
    assert _body("OT") != _body("OA")


# ── The line is DERIVED, not written ──────────────────────────────────────

@pytest.mark.parametrize("role", ["OA", "PSA"])
def test_clinical_roles_name_every_clinical_topic(role):
    line = role_focus(role)
    assert [t for t in CLINICAL if t not in line] == []


def test_ot_names_every_ot_topic():
    line = role_focus("OT")
    assert [t for t in OT if t not in line] == []


@pytest.mark.parametrize("role", ["OA", "PSA"])
def test_clinical_roles_name_no_ot_topic(role):
    """The failure this catches: an OA told to study Humphrey Visual Field."""
    line = role_focus(role)
    assert [t for t in OT if t in line] == []


def test_ot_names_no_clinical_only_topic():
    line = role_focus("OT")
    assert [t for t in CLINICAL if t in line] == []


@pytest.mark.parametrize("role", ["OA", "PSA", "OT"])
def test_every_role_names_the_shared_foundations(role):
    """FOUNDATIONS is studied by everyone, so it belongs in every role's scope."""
    line = role_focus(role)
    assert [t for t in FOUNDATIONS if t not in line] == []


def test_titles_cover_exactly_the_three_student_roles():
    assert set(ROLE_TITLES) == {"OA", "OT", "PSA"}


@pytest.mark.parametrize("role", ["", None, "trainer", "admin"])
def test_unknown_role_yields_no_line(role):
    """Matches the old `.get(role.upper(), "")`: tutor_system falls back to the base
    prompt rather than injecting a wrong role's scope."""
    assert role_focus(role) == ""


def test_role_is_matched_case_insensitively_and_trimmed():
    assert role_focus("oa") == role_focus("OA")
    assert role_focus(" ot ") == role_focus("OT")


# ── The scope predicate, moved here from quests.py ─────────────────────────

def test_bare_key_strips_only_a_known_difficulty():
    assert bare_key("glaucoma__easy") == "glaucoma"
    assert bare_key("glaucoma") == "glaucoma"
    # Not a difficulty — a bare rpartition would have blanked this to "glaucoma".
    assert bare_key("some__topic") == "some__topic"


def test_in_scope_drops_the_other_pools_topics():
    assert in_scope(["glaucoma", "distance_va", "hvf"], "OT") == ["glaucoma", "hvf"]
    assert in_scope(["glaucoma", "distance_va", "hvf"], "OA") == ["glaucoma", "distance_va"]


def test_in_scope_agrees_for_oa_and_psa():
    topics = ["glaucoma", "distance_va", "hvf", "oct_macula"]
    assert in_scope(topics, "OA") == in_scope(topics, "PSA")


def test_in_scope_drops_raw_osce_case_topics():
    """What actually shipped to an OA: a raw case topic written by cases.py into
    retention_scores. It is off-syllabus in every pool."""
    assert in_scope(["Cirrus_Oct_Macular_Scan"], "OA") == []


def test_in_scope_returns_the_stored_key_not_the_normalised_one():
    """quests.py builds its progress metric from the STORED key; normalising here
    would break the identity between the retention entry and the daily tally."""
    assert in_scope(["glaucoma__easy"], "OA") == ["glaucoma__easy"]


# ── No second copy may come back ──────────────────────────────────────────

def test_no_hand_written_role_context_survives():
    """The original bug was TWO copies of a hand-written dict that disagreed with the
    content model. This fails the moment one is DEFINED again anywhere in tools/.

    Matches an assignment, not a mention: role_scope's own docstring names the constant
    it replaced, and that history is worth keeping.
    """
    root = Path(__file__).resolve().parents[2] / "tools"
    definition = re.compile(r"_ROLE_TUTOR_CONTEXT\s*[:=]")
    offenders = [
        str(p.relative_to(root)) for p in root.rglob("*.py")
        if definition.search(p.read_text(encoding="utf-8"))
    ]
    assert offenders == []
