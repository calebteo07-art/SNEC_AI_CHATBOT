"""The consultation label is sanitised server-side.

`_build_student_findings` splits tutor sessions from station sessions on
`topic.startswith("Case:")`. Once the label is client-supplied, that discriminator is
forgeable by anything a student types into the chat box -- so the prefix is stripped here.
"""
from tools.api.routers.chat import sanitize_topic


def test_sanitize_topic_strips_a_forged_case_prefix():
    assert sanitize_topic("Case: my fake station") == "my fake station"
    assert sanitize_topic("  case:   spaced  ") == "spaced"


def test_sanitize_topic_truncates_to_the_column_bound():
    assert len(sanitize_topic("x" * 500)) == 100


def test_sanitize_topic_falls_back_to_the_sentinel_when_empty():
    """An empty label must not become an empty topic: the reader distinguishes 'recorded'
    from 'not recorded' by the sentinel, and an empty string reads as neither."""
    assert sanitize_topic("") == "Ophthalmology"
    assert sanitize_topic("   ") == "Ophthalmology"
    assert sanitize_topic("Case:") == "Ophthalmology"
