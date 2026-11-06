"""The unverified Hermes host cannot obtain an ExecFlow service capability."""
import importlib.util
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

PROXY = Path(__file__).resolve().parents[2] / "hermes/plugins/execflow/dashboard/plugin_api.py"


@pytest.mark.parametrize("credentials", [False, True])
@pytest.mark.parametrize("method,path,body", [
    ("GET", "/overview", None), ("GET", "/runs/synthetic", None),
    ("POST", "/analyse", {"dataset_id": "synthetic"}), ("POST", "/analyse", None),
])
def test_proxy_disabled_with_or_without_inbound_credentials(monkeypatch, credentials, method, path, body):
    monkeypatch.setenv("EXECFLOW_API_TOKEN", "synthetic-service-secret")
    monkeypatch.setenv("EXECFLOW_PROXY_ENABLED", "true")
    monkeypatch.setenv("EXECFLOW_URL", "https://upstream.example.test")
    spec = importlib.util.spec_from_file_location("disabled_execflow_proxy", PROXY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert not hasattr(module, "_get") and not hasattr(module, "_post")
    app = FastAPI()
    app.include_router(module.router, prefix="/api/plugins/execflow")
    headers = {"Authorization": "Bearer synthetic-inbound-token"} if credentials else {}
    response = TestClient(app).request(method, f"/api/plugins/execflow{path}", json=body, headers=headers)
    assert response.status_code == 503
    assert "disabled" in response.json()["detail"]
    assert "synthetic-service-secret" not in response.text
    assert "upstream.example.test" not in response.text
