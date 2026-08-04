"""A completed deck is ONE completion, however many topics it covers.

flashcards_complete calls update_profile once per topic in the deck. The XP award is
guarded with i == 0 so a deck pays once; the activity source needs the same guard, or a
three-topic deck counts as three deck completions and a "clear 3 decks" quest is cleared
by finishing one.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def test_a_multi_topic_deck_records_exactly_one_flashcard_completion():
    body = {"results": [
        {"card_id": "c1", "correct": True, "topic_tag": "gonioscopy"},
        {"card_id": "c2", "correct": True, "topic_tag": "visual fields"},
        {"card_id": "c3", "correct": False, "topic_tag": "tonometry"},
    ]}
    # update_card_sm2 and db.insert_flashcard_attempt are real DB writes the handler
    # fires for every result carrying a card_id / topic_tag -- mocked so this test never
    # touches the (production) database, matching the pattern in test_flashcards_complete.py.
    with patch("tools.api.routers.student.update_profile", AsyncMock()) as upd, \
         patch("tools.api.routers.student.get_profile", AsyncMock(return_value={"xp": 0})), \
         patch("tools.api.routers.student.update_card_sm2", AsyncMock()), \
         patch("tools.api.routers.student.db.insert_flashcard_attempt", AsyncMock()):
        resp = client.post(
            "/api/flashcards/complete", json=body,
            cookies={"eyebot_token": create_access_token("ann", "student", "OA")},
        )
    assert resp.status_code == 200
    # Non-empty proves the request actually reached the handler -- a 422 on a bad payload
    # would leave call_args_list empty and the assertion below would pass vacuously.
    assert upd.call_args_list
    sourced = [c for c in upd.call_args_list if c.kwargs.get("source") == "flashcards"]
    assert len(sourced) == 1
