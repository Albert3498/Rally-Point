from unittest.mock import Mock, patch

import pytest

from support import client, make_user
import events_store


@pytest.fixture
def events_database(tmp_path, monkeypatch):
    monkeypatch.setattr(events_store, "EVENTS_DB_PATH", str(tmp_path / "events.db"))
    events_store.initialize_events_db()


def test_automatic_sync_persists_and_updates_provider_events(events_database):
    admin = make_user("Automatic Events Admin", role="admin")
    response = Mock()
    response.json.return_value = {
        "success": True,
        "data": [{
            "id": 49,
            "title": "Provider beach cleanup",
            "city": "Los Angeles",
            "country": "US",
            "start_date": "2026-10-30",
            "category": "Environment",
        }],
    }

    with patch("automatic_events.requests.get", return_value=response):
        first_sync = client.post("/events/automatic-sync", headers=admin)
        assert first_sync.status_code == 200, first_sync.text
        response.json.return_value["data"][0]["title"] = "Updated provider cleanup"
        second_sync = client.post("/events/automatic-sync", headers=admin)

    assert second_sync.status_code == 200, second_sync.text
    assert second_sync.json()["count"] == 1
    assert len(second_sync.json()["events"]) == 1
    assert second_sync.json()["events"][0]["title"] == "Updated provider cleanup"

    listed = client.get("/events/?name=Updated%20provider")
    assert listed.status_code == 200
    assert listed.json()["events"] == second_sync.json()["events"]
    assert "external_id" not in listed.json()["events"][0]


def test_automatic_sync_requires_admin(events_database):
    user = make_user("Automatic Events User")
    assert client.post("/events/automatic-sync", headers=user).status_code == 403


def test_automatic_sync_rejects_unexpected_provider_shape(events_database):
    admin = make_user("Automatic Events Shape Admin", role="admin")
    response = Mock()
    response.json.return_value = {"success": True, "data": {"not": "a list"}}

    with patch("automatic_events.requests.get", return_value=response):
        result = client.post("/events/automatic-sync", headers=admin)

    assert result.status_code == 502
    assert client.get("/events/").json()["events"] == []
