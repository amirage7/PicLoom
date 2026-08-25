from typing import Any

from app import desktop_entry


def test_desktop_entry_binds_only_to_loopback(monkeypatch: Any) -> None:
    captured: dict[str, object] = {}

    def fake_run(application: str, **kwargs: object) -> None:
        captured['application'] = application
        captured.update(kwargs)

    monkeypatch.setattr(desktop_entry.uvicorn, 'run', fake_run)

    desktop_entry.main(['--port', '8123'])

    assert captured == {'application': 'app.main:app', 'host': '127.0.0.1', 'port': 8123}
