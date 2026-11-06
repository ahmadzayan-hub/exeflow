"""Synthetic ASGI upload limits: no network, real credentials or datasets."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from execflow import api, upload_limits


def invoke(messages, headers=(), limit=8, path="/api/upload", inner=None, root_path=""):
    sent, consumed, received = [], [], []
    queue = iter(messages)

    async def receive():
        received.append(True)
        return next(queue)

    async def send(message):
        sent.append(message)

    async def app(scope, receive, send):
        while True:
            msg = await receive()
            consumed.append(msg.get("body", b""))
            if not msg.get("more_body", False):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})

    scope = {"type": "http", "method": "POST", "path": path,
             "root_path": root_path, "headers": list(headers)}
    middleware = upload_limits.UploadBodyLimitMiddleware(inner or app, limit)
    asyncio.run(middleware(scope, receive, send))
    return sent, b"".join(consumed), len(received)


def body(value, more=False):
    return {"type": "http.request", "body": value, "more_body": more}


@pytest.mark.parametrize("headers", [[], [(b"content-length", b"8")], [(b"content-length", b"0008")]])
def test_exact_limit_replays_unchanged(headers):
    sent, consumed, reads = invoke([body(b"1234", True), body(b"5678")], headers)
    assert sent[0]["status"] == 200
    assert consumed == b"12345678"
    assert reads == 2


@pytest.mark.parametrize("headers", [[], [(b"content-length", b"1")]])
def test_chunked_or_underreported_body_rejected_before_parser(headers):
    sent, consumed, reads = invoke([body(b"12345678", True), body(b"9", True), body(b"never read")], headers)
    assert sent[0]["status"] == 413
    assert (b"cache-control", b"no-store") in sent[0]["headers"]
    assert not consumed and reads == 2


@pytest.mark.parametrize("length", [b"9", b"0009", b"9" * 5000])
def test_oversized_declared_length_never_reads_body(length):
    sent, consumed, reads = invoke([], [(b"content-length", length)])
    assert sent[0]["status"] == 413 and reads == 0 and not consumed


@pytest.mark.parametrize("headers", [
    [(b"content-length", b"-1")], [(b"content-length", b"")],
    [(b"content-length", b"1.0")], [(b"content-length", b" 1")],
    [(b"content-length", b"1"), (b"content-length", b"1")],
])
def test_invalid_length_fails_without_reading(headers):
    sent, _, reads = invoke([], headers)
    assert sent[0]["status"] == 400 and reads == 0


def test_trailing_slash_cannot_bypass_request_limit():
    assert invoke([body(b"123456789")], path="/api/upload/")[0][0]["status"] == 413


@pytest.mark.parametrize("prefix", ["/execflow", "/nested/execflow"])
def test_root_path_cannot_bypass_request_limit(prefix):
    sent, consumed, _ = invoke([body(b"123456789")],
                              path=prefix + "/api/upload", root_path=prefix)
    assert sent[0]["status"] == 413 and not consumed


@pytest.mark.parametrize("path", ["/api/health", "/api/datasets", "/api/memory.md", "/docs", "/openapi.json"])
@pytest.mark.parametrize("prefix", ["/execflow", "/nested/execflow"])
def test_prefixed_api_and_docs_still_require_auth(monkeypatch, tmp_path, prefix, path):
    monkeypatch.setenv("EXECFLOW_API_TOKEN", "synthetic-upload-token")
    monkeypatch.setattr(api, "DATA_ROOT", tmp_path)
    client = TestClient(api.app, root_path=prefix)
    response = client.get(prefix + path)
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"
    assert not list(tmp_path.iterdir())


def test_prefixed_upload_preserves_auth_limit_and_success(monkeypatch, tmp_path):
    monkeypatch.setenv("EXECFLOW_API_TOKEN", "synthetic-upload-token")
    monkeypatch.setattr(api, "DATASETS", tmp_path / "datasets")
    client = TestClient(api.app, root_path="/execflow")
    path = "/execflow/api/upload"
    assert client.post(path, content=b"not parsed").status_code == 401
    headers = {"Authorization": "Bearer synthetic-upload-token"}
    response = client.post(path, content=b"", headers={**headers, "Content-Length": "999999999"})
    assert response.status_code == 413
    assert not list(tmp_path.iterdir())
    response = client.post(path, headers=headers,
                           files={"file": ("synthetic.csv", b"Category,Value\nA,10\nB,20\n")})
    assert response.status_code == 200
    assert response.json()["dataset"]["filename"] == "synthetic.csv"


def test_empty_request_is_replayed():
    assert invoke([body(b"")])[0][0]["status"] == 200


@pytest.mark.parametrize("outcome", ["success", "over_limit", "disconnect", "app_error"])
def test_spool_is_closed_for_every_exit(monkeypatch, outcome):
    real_spool = upload_limits.SpooledTemporaryFile
    spools = []

    def tracked_spool(**kwargs):
        obj = real_spool(**kwargs)
        spools.append(obj)
        return obj

    monkeypatch.setattr(upload_limits, "SpooledTemporaryFile", tracked_spool)
    monkeypatch.setattr(upload_limits, "SPOOL_MEMORY_BYTES", 2)
    messages = [body(b"1234")]
    inner = None
    if outcome == "over_limit":
        messages = [body(b"1234", True), body(b"56789")]
    elif outcome == "disconnect":
        messages = [body(b"1234", True), {"type": "http.disconnect"}]
    elif outcome == "app_error":
        async def inner(scope, receive, send):
            raise RuntimeError("synthetic parser error")
    if outcome == "app_error":
        with pytest.raises(RuntimeError, match="synthetic parser error"):
            invoke(messages, inner=inner)
    else:
        invoke(messages)
    assert len(spools) == 1 and spools[0].closed
    assert spools[0]._rolled  # The test exercises a real disk-backed temporary file.


@pytest.mark.parametrize("limit", [0, -1])
def test_invalid_limits_fail_closed(limit):
    with pytest.raises(ValueError, match="positive"):
        upload_limits.UploadBodyLimitMiddleware(None, limit)


def test_authentication_precedes_upload_gate(monkeypatch):
    monkeypatch.setenv("EXECFLOW_API_TOKEN", "synthetic-upload-token")
    client = TestClient(api.app)
    headers = {"Content-Length": "999999999"}
    assert client.post("/api/upload", headers=headers, content=b"").status_code == 401
    headers["Authorization"] = "Bearer synthetic-upload-token"
    headers["Origin"] = "http://localhost:5173"
    response = client.post("/api/upload", headers=headers, content=b"")
    assert response.status_code == 413
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


@pytest.mark.parametrize("token,status", [("", 503), ("synthetic-upload-token", 401)])
def test_denied_request_never_consumes_body(monkeypatch, token, status):
    monkeypatch.setenv("EXECFLOW_API_TOKEN", token)
    sent = []

    async def receive():
        raise AssertionError("Authentication denial must not read request bytes")

    async def send(message):
        sent.append(message)

    scope = {"type": "http", "method": "POST", "path": "/api/upload",
             "headers": [(b"content-length", b"999999999")],
             "query_string": b"", "http_version": "1.1", "scheme": "http"}
    asyncio.run(api.app(scope, receive, send))
    assert sent[0]["status"] == status


def test_bounded_file_read_rejects_before_ingest_or_storage(monkeypatch, tmp_path):
    monkeypatch.setattr(api, "MAX_UPLOAD_MB", 1)
    monkeypatch.setattr(api, "DATASETS", tmp_path / "datasets")
    monkeypatch.setenv("EXECFLOW_API_TOKEN", "synthetic-upload-token")

    def forbidden(*args, **kwargs):
        raise AssertionError("Oversized file must not be ingested or persisted")

    monkeypatch.setattr(api, "ingest", forbidden)
    monkeypatch.setattr(api, "save_dataset", forbidden)
    client = TestClient(api.app, headers={"Authorization": "Bearer synthetic-upload-token"})
    response = client.post("/api/upload", files={"file": ("synthetic.csv", b"x" * (1024 * 1024 + 1))})
    assert response.status_code == 413
    assert not list(tmp_path.iterdir())


def test_upload_file_reader_requests_only_limit_plus_one(monkeypatch):
    monkeypatch.setattr(api, "MAX_UPLOAD_MB", 1)

    class SyntheticFile:
        async def read(self, size):
            assert size == 1024 * 1024 + 1
            return b"x" * size

    with pytest.raises(api.HTTPException) as error:
        asyncio.run(api.upload(SyntheticFile(), None))
    assert error.value.status_code == 413
