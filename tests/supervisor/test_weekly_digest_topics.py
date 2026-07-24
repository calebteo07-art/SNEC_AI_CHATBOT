# tests/supervisor/test_weekly_digest_topics.py
"""Regression guard for `_weak_topics_section` after the weakest_topics shape change.

Task 3 changed cohort_summary()'s weakest_topics from list[str] to
list[{"topic": str, "count": int}], which would have crashed the weekly
digest email (`AttributeError: 'dict' object has no attribute 'replace'`)
had `_weak_topics_section` not been updated to read the new shape. This
locks the fix in place — including that the digest's visible content stays
byte-identical to before (no counts appended to the rendered pills, which
was never a requested or designed change).
"""
import re

from tools.supervisor.weekly_digest import _weak_topics_section


def _pill_texts(html: str) -> list[str]:
    """Extract each pill's rendered inner text. Matches on element shape
    (`<span ...>...</span>`), not a specific CSS value, so restyling the
    pill (font-weight, property order, colour) can't silently break this
    into a false failure — `_weak_topics_section`'s only <span>s are the
    pills, and the wrapping <h3>/<p> never nest one."""
    return re.findall(r'<span[^>]*>([^<]+)</span>', html)


def test_renders_humanised_topic_names():
    topics = [
        {"topic": "tonometry", "count": 3},
        {"topic": "anterior_segment", "count": 1},
    ]
    html = _weak_topics_section(topics)
    pills = _pill_texts(html)
    assert "tonometry" in pills
    assert "anterior segment" in pills


def test_does_not_render_raw_underscore_form():
    topics = [{"topic": "anterior_segment", "count": 1}]
    html = _weak_topics_section(topics)
    assert "anterior_segment" not in html


def test_does_not_render_counts():
    """Locks in the revert: the digest email's pills must be exactly the
    humanised topic name — no count suffix. Surfacing counts in the digest
    is a product decision nobody made, not a side effect of the type fix."""
    topics = [{"topic": "tonometry", "count": 3}, {"topic": "refraction", "count": 1}]
    html = _weak_topics_section(topics)
    assert _pill_texts(html) == ["tonometry", "refraction"]


def test_empty_list_does_not_raise():
    assert _weak_topics_section([]) == ""
