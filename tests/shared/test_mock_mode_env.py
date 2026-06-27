# tests/shared/test_mock_mode_env.py
"""MOCK_MODE must be forceable ON via the MOCK_MODE env var.

CI sets ``MOCK_MODE: "true"`` to guarantee the suite never makes a live Gemini
call. The client decides mock-vs-live purely from API-key presence, so without
honouring the env var a stray key in the test environment would silently switch
the whole suite to live calls — quota/latency then makes timing-sensitive tests
(e.g. the OSCE /action coaching test) flake exactly like the bug we just fixed.
The override may only force mock ON; it can never enable live mode.
"""
from tools.shared.gemini_client import _mock_mode_from_env


def test_no_keys_is_mock():
    assert _mock_mode_from_env([], "") is True


def test_key_present_is_live_by_default():
    assert _mock_mode_from_env(["real-key"], "") is False


def test_env_forces_mock_even_with_key():
    for truthy in ("1", "true", "TRUE", "yes", "on"):
        assert _mock_mode_from_env(["real-key"], truthy) is True, truthy


def test_falsey_env_does_not_disable_mock_when_no_keys():
    # The override only forces mock ON — it can never turn it OFF.
    for falsey in ("", "0", "false", "no", "off", None):
        assert _mock_mode_from_env([], falsey) is True, falsey


def test_falsey_env_leaves_live_mode_with_key():
    for falsey in ("0", "false", "off"):
        assert _mock_mode_from_env(["real-key"], falsey) is False, falsey
