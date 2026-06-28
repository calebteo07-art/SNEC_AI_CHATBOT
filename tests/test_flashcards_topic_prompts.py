"""The topic-image generator must cover every flashcard topic (both pools) plus
the mixed deck, with ASCII-only, non-empty prompts. Pure — no API calls."""
from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS
from tools.media.generate_flashcards_topics import SUBJECTS, build_prompt


def _expected_keys() -> set[str]:
    keys = {"__mixed"}
    for pool in FLASHCARD_TOPICS.values():
        for topic_key, _label in pool:
            keys.add(topic_key)
    return keys


def test_subjects_cover_all_topics_and_mixed():
    assert set(SUBJECTS.keys()) == _expected_keys()


def test_subjects_ascii_and_nonempty():
    for key, subject in SUBJECTS.items():
        assert subject.strip(), f"empty subject for {key}"
        subject.encode("ascii")  # raises UnicodeEncodeError on non-ASCII


def test_build_prompt_includes_subject_and_negatives():
    prompt = build_prompt("oct_macula")
    assert SUBJECTS["oct_macula"] in prompt
    assert "no text" in prompt.lower()
