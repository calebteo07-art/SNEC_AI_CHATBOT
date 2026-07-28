"""Cold-start warmup: pre-touch lazy clients so the FIRST request after a cold
boot doesn't pay their init on its critical path.

Render free spins the container down when idle; the first request afterwards would
otherwise construct the Supabase async client (+ httpx pool) and import google-genai
inline. `_warmup` does that off the critical path. It must make NO live model call
(zero quota/cost — build the client only) and be fully fail-open so a slow or missing
dependency can never wedge startup.
"""
import asyncio
from unittest.mock import patch, AsyncMock


def test_warmup_prewarms_supabase_and_gemini_without_live_call():
    from tools.api import server
    from tools.shared import gemini_client

    supa = AsyncMock()
    with patch("tools.shared.db._get_client", supa), \
         patch.object(server, "MOCK_MODE", False), \
         patch.object(gemini_client, "_ensure_sdk_clients", return_value=[]) as ensure:
        asyncio.run(server._warmup())

    supa.assert_awaited_once()          # Supabase async client constructed
    ensure.assert_called_once()         # google-genai imported + client built (no generate)


def test_warmup_skips_gemini_in_mock_mode_and_is_fail_open():
    from tools.api import server
    from tools.shared import gemini_client

    with patch("tools.shared.db._get_client", AsyncMock(side_effect=RuntimeError("no db"))), \
         patch.object(server, "MOCK_MODE", True), \
         patch.object(gemini_client, "_ensure_sdk_clients") as ensure:
        # Must NOT raise despite the Supabase failure — warmup is best-effort.
        asyncio.run(server._warmup())

    ensure.assert_not_called()          # no key / mock mode → never touch the SDK


def test_warmup_warms_the_case_index():
    """The index is 155 blocking file reads; the first cohort-analytics request must not
    pay them. Fail-open like the rest of _warmup — a bad case file cannot wedge startup."""
    from tools.api import server
    from tools.supervisor import case_index

    warm = AsyncMock(return_value={})
    with patch("tools.shared.db._get_client", AsyncMock()), \
         patch.object(server, "MOCK_MODE", True), \
         patch.object(case_index, "get_case_index", warm):
        asyncio.run(server._warmup())

    warm.assert_awaited_once()


def test_warmup_survives_a_failing_case_index():
    from tools.api import server
    from tools.supervisor import case_index

    with patch("tools.shared.db._get_client", AsyncMock()), \
         patch.object(server, "MOCK_MODE", True), \
         patch.object(case_index, "get_case_index", AsyncMock(side_effect=RuntimeError("bad case file"))):
        asyncio.run(server._warmup())  # must NOT raise
