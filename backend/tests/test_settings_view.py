from app.api.v1 import settings_view


def test_routing_provider_prefers_ola_then_google(monkeypatch):
    monkeypatch.setattr(settings_view.settings, "OLA_MAPS_API_KEY", "x")
    monkeypatch.setattr(settings_view.settings, "GOOGLE_ROUTES_API_KEY", "y")
    assert settings_view.routing_provider() == ("Ola Maps", True)
    monkeypatch.setattr(settings_view.settings, "OLA_MAPS_API_KEY", None)
    assert settings_view.routing_provider() == ("Google Routes", True)
    monkeypatch.setattr(settings_view.settings, "GOOGLE_ROUTES_API_KEY", None)
    assert settings_view.routing_provider() == ("OpenStreetMap (OSRM)", False)
