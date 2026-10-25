from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from memory_server import read_sighting


def test_read_only_lookup_and_empty_history(monkeypatch):
    sessions = MagicMock()
    session = sessions.return_value.__enter__.return_value
    lookup = MagicMock(return_value=None)
    monkeypatch.setattr("memory_server.lookup_last_sighting", lookup)
    identifier = str(uuid4())
    assert read_sighting(identifier, "2026-10-25T01:00:00Z", sessions) == {"status": "never_seen"}
    assert str(session.execute.call_args.args[0]) == "SET TRANSACTION READ ONLY"
    assert str(lookup.call_args.args[1]) == identifier


def test_query_failure_is_not_never_seen(monkeypatch):
    sessions = MagicMock()
    monkeypatch.setattr("memory_server.lookup_last_sighting", MagicMock(side_effect=RuntimeError("db secret")))
    assert read_sighting(str(uuid4()), "2026-10-25T01:00:00Z", sessions) == {"status": "unavailable"}


def test_invalid_tool_arguments_fail_before_database():
    sessions = MagicMock()
    with pytest.raises(ValueError):
        read_sighting("not-a-uuid", "2026-10-25T01:00:00Z", sessions)
    sessions.assert_not_called()
