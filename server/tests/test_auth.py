"""Authentication is checked before any dataset, memory or provider access."""
import pytest
from fastapi.testclient import TestClient
from execflow import api

PATHS = [
    ("GET", "/api/health"), ("POST", "/api/upload"),
    ("GET", "/api/datasets"), ("GET", "/api/datasets/id"),
    ("GET", "/api/tools"), ("POST", "/api/tool"),
    ("POST", "/api/analyse"), ("GET", "/api/runs"),
    ("GET", "/api/runs/id"), ("GET", "/api/runs/id/report.md"),
    ("GET", "/api/memory"), ("POST", "/api/memory"),
    ("DELETE", "/api/memory/id"), ("GET", "/api/memory.md"),
    ("GET", "/docs"), ("GET", "/redoc"), ("GET", "/openapi.json"),
    ("GET", "/api/future-route"), ("GET", "/api/datasets/"),
]

@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("EXECFLOW_API_TOKEN", "test-only-not-a-real-credential")
    monkeypatch.setenv("EXECFLOW_PROVIDER", "mock")
    monkeypatch.setattr(api, "DATA_ROOT", tmp_path)
    monkeypatch.setattr(api, "DATASETS", tmp_path / "datasets")
    def forbidden(*args, **kwargs):
        pytest.fail("Unauthenticated request reached a protected side effect")
    for name in ("memory", "_load", "list_datasets", "ingest", "run_analysis"):
        monkeypatch.setattr(api, name, forbidden)
    return TestClient(api.app)

@pytest.mark.parametrize("method,path", PATHS)
@pytest.mark.parametrize("authorization", [None, "Bearer wrong", "Basic abc", "Bearer", "Bearer ü"])
def test_denies_all_surfaces(client, method, path, authorization):
    headers = {} if authorization is None else {b"authorization": authorization.encode()}
    res = client.request(method, path, headers=headers)
    assert res.status_code == 401
    assert res.headers["www-authenticate"] == "Bearer"
    assert res.headers["cache-control"] == "no-store"

@pytest.mark.parametrize("value", [None, "", "   "])
def test_missing_configuration_fails_closed(client, monkeypatch, value):
    if value is None:
        monkeypatch.delenv("EXECFLOW_API_TOKEN")
    else:
        monkeypatch.setenv("EXECFLOW_API_TOKEN", value)
    assert client.get("/api/memory").status_code == 503


def test_query_cookie_and_duplicate_header_are_not_auth(client):
    token = "test-only-not-a-real-credential"
    assert client.get(f"/api/memory?token={token}", cookies={"token": token}).status_code == 401
    assert client.get("/api/memory", headers=[("Authorization", f"Bearer {token}"), ("Authorization", "Bearer wrong")]).status_code == 401


def test_preflight_only_and_public_static(client):
    res = client.options("/api/memory", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert client.options("/api/memory").status_code == 401
    assert client.get("/").status_code != 401


def test_configured_token_accepts_and_rotation_rejects_old(client, monkeypatch):
    headers = {"Authorization": "bEaReR test-only-not-a-real-credential"}
    assert client.get("/api/tools", headers=headers).status_code == 200
    monkeypatch.setenv("EXECFLOW_API_TOKEN", "different-test-only-value")
    assert client.get("/api/tools", headers=headers).status_code == 401
