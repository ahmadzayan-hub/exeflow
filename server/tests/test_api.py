import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("EXECFLOW_PROVIDER", "mock")
    import execflow.api as api

    monkeypatch.setattr(api, "DATA_ROOT", tmp_path)
    monkeypatch.setattr(api, "DATASETS", tmp_path / "datasets")
    api._memory = None
    return TestClient(api.app)


def test_health_and_upload_analyse_flow(client, xlsx_bytes):
    h = client.get("/api/health").json()
    assert h["routing"]["mock"] is True and ".xlsx" in h["supported_files"]

    up = client.post("/api/upload", files={"file": ("kpi.xlsx", xlsx_bytes, "application/octet-stream")})
    assert up.status_code == 200, up.text
    ds_id = up.json()["dataset"]["id"]
    assert up.json()["candidate_metrics"][0]["table"] == "KPI_Data"

    assert client.get("/api/datasets").json()["datasets"][0]["id"] == ds_id
    t = client.post("/api/tool", json={"dataset_id": ds_id, "tool": "aggregate", "args": {"table": "KPI_Data", "metric": "Failures", "group_by": "System"}}).json()
    assert t["rows"][0]["sum_Failures"] == 36
    assert client.post("/api/tool", json={"dataset_id": ds_id, "tool": "sample_rows", "args": {"table": "KPI_Data"}}).status_code == 400

    r = client.post("/api/analyse", json={"dataset_id": ds_id, "question": "Failures by system", "lang": "en"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["findings"] and body["report_md"]
    run_id = body["run_id"]
    assert client.get(f"/api/runs/{run_id}").json()["status"] == "done"
    assert client.get(f"/api/runs/{run_id}/report.md").text.startswith("# Executive summary")
    assert client.get(f"/api/datasets/{ds_id}").json()["runs"][0]["id"] == run_id

    m = client.post("/api/memory", json={"kind": "preference", "text": "Report in English with Arabic summary"}).json()
    assert client.get("/api/memory", params={"q": "arabic"}).json()["items"][0]["id"] == m["id"]
    assert "Preferences" in client.get("/api/memory.md").text
    assert client.delete(f"/api/memory/{m['id']}").json()["ok"]
    assert client.post("/api/memory", json={"kind": "bogus", "text": "x"}).status_code == 400


def test_upload_rejects_unknown_type(client):
    assert client.post("/api/upload", files={"file": ("x.exe", b"zz", "application/octet-stream")}).status_code == 400
