"""Synthetic policy tests: HTTP uses MockTransport, never a live model/server."""
import httpx
import pytest
from fastapi.testclient import TestClient

from execflow import api, llm
from execflow.execution_policy import ExecutionPolicyError
from execflow.llm import ChatClient, ModelRef, MockClient, ROLES, client_for, load_routing


@pytest.fixture(autouse=True)
def clean_model_environment(monkeypatch):
    # Remove inherited configuration without reading or printing real values.
    for name in ("EXECFLOW_MODE", "EXECFLOW_PROVIDER", "OLLAMA_BASE_URL"):
        monkeypatch.delenv(name, raising=False)
    for role in ROLES:
        monkeypatch.delenv(f"EXECFLOW_MODEL_{role.upper()}", raising=False)


def test_default_is_offline_even_with_keys(monkeypatch):
    for name in ("GROQ_API_KEY", "NOUS_API_KEY", "OPENROUTER_API_KEY", "API_SERVER_KEY"):
        monkeypatch.setenv(name, "synthetic-test-key")
    routing = load_routing()
    assert routing.mode == "mock" and routing.mock
    assert routing.describe()["cloud_allowed"] is False
    assert routing.describe()["providers_with_keys"] == []
    for role in ROLES:
        assert isinstance(client_for(routing, role), MockClient)
        client_for(routing, role).chat([])


@pytest.mark.parametrize("mode", ["", "cloud", "paid", "false", "unrestricted", "local-only"])
def test_unknown_or_empty_mode_fails_closed(mode):
    with pytest.raises(ExecutionPolicyError):
        load_routing({"EXECFLOW_MODE": mode})


@pytest.mark.parametrize("mode", ["mock", "local"])
@pytest.mark.parametrize("provider", ["groq", "nous", "openrouter", "hermes", "custom", ""])
def test_default_cloud_provider_rejected_even_without_key(mode, provider):
    with pytest.raises(ExecutionPolicyError):
        load_routing({"EXECFLOW_MODE": mode, "EXECFLOW_PROVIDER": provider})


@pytest.mark.parametrize("mode", ["mock", "local"])
@pytest.mark.parametrize("role", ROLES)
@pytest.mark.parametrize("provider", ["groq", "nous", "openrouter", "hermes", "custom"])
def test_each_role_override_is_validated(mode, role, provider):
    with pytest.raises(ExecutionPolicyError):
        load_routing({"EXECFLOW_MODE": mode, f"EXECFLOW_MODEL_{role.upper()}": f"{provider}:model"})


def test_mock_mode_cannot_send_to_local_server():
    with pytest.raises(ExecutionPolicyError):
        load_routing({"EXECFLOW_PROVIDER": "ollama"})
    with pytest.raises(ExecutionPolicyError):
        ChatClient("ollama", "hermes3")


@pytest.mark.parametrize("url", [
    "https://api.example.test/v1", "https://ollama.com/v1", "http://localhost:11434/v1",
    "http://127.0.0.1.example.test/v1", "http://192.168.1.10/v1", "http://0.0.0.0/v1",
    "http://169.254.169.254/v1", "http://2130706433/v1", "http://[::]/v1",
    "http://[::ffff:127.0.0.1]/v1", "http://user:secret@127.0.0.1/v1",
    "http://127.0.0.1/v1?key=synthetic", "http://127.0.0.1/v1#fragment",
    "http://127.0.0.1/v1/other", "http://127.0.0.1:0/v1", "http://127.0.0.1:bad/v1",
    "http://127.0.0.1:99999/v1", "ftp://127.0.0.1/v1", "//127.0.0.1/v1",
    "http://127.0.0.1\\@example.test/v1", " http://127.0.0.1/v1",
    "http://127.0.0.1\n/v1", "http://[::1%25scope]/v1",
])
def test_unsafe_endpoint_rejected_before_transport(monkeypatch, url):
    monkeypatch.setenv("EXECFLOW_MODE", "local")
    with pytest.raises(ExecutionPolicyError):
        load_routing({"EXECFLOW_MODE": "local", "OLLAMA_BASE_URL": url})
    with pytest.raises(ExecutionPolicyError):
        ChatClient("ollama", "hermes3", base_url=url)


@pytest.mark.parametrize("url", ["http://127.0.0.1:11434/v1", "https://127.0.0.1/v1/", "http://[::1]:11434/v1"])
def test_loopback_configuration_is_accepted_without_calling_it(url):
    assert load_routing({"EXECFLOW_MODE": "local", "OLLAMA_BASE_URL": url}).mode == "local"


@pytest.mark.parametrize("model", ["gpt-oss:120b-cloud", "model:cloud", "CLOUD-model", "model/cloud", "https://example.test/model", "", "model\n"])
def test_hosted_or_invalid_ollama_models_rejected(model):
    with pytest.raises(ExecutionPolicyError):
        load_routing({"EXECFLOW_MODE": "local", "EXECFLOW_MODEL_REPORTER": f"ollama:{model}"})


def test_manually_modified_routing_cannot_escape_policy():
    routing = load_routing({})
    routing.roles["reporter"] = ModelRef("groq", "model")
    with pytest.raises(ExecutionPolicyError):
        client_for(routing, "reporter")


@pytest.mark.parametrize("provider", ["groq", "nous", "openrouter", "hermes", "mock"])
def test_direct_network_client_cannot_bypass_routing(monkeypatch, provider):
    monkeypatch.setenv("EXECFLOW_MODE", "local")
    with pytest.raises(ExecutionPolicyError):
        ChatClient(provider, "model", base_url="http://127.0.0.1:11434/v1")


def test_local_client_rejects_credentials(monkeypatch):
    monkeypatch.setenv("EXECFLOW_MODE", "local")
    with pytest.raises(ExecutionPolicyError):
        ChatClient("ollama", "hermes3", api_key="synthetic-key")


@pytest.mark.parametrize("mutation", ["url", "provider", "model", "mode"])
def test_policy_rechecked_at_send(monkeypatch, mutation):
    monkeypatch.setenv("EXECFLOW_MODE", "local")
    client = ChatClient("ollama", "hermes3")
    if mutation == "url":
        client.base_url = "https://example.test/v1"
    elif mutation == "provider":
        client.provider = "hermes"
    elif mutation == "model":
        client.model = "model:cloud"
    else:
        monkeypatch.setenv("EXECFLOW_MODE", "mock")
    with pytest.raises(ExecutionPolicyError):
        client.chat([])


def install_mock_transport(monkeypatch, handler):
    real_client = httpx.Client
    seen_options = []
    def client(**kwargs):
        seen_options.append(kwargs)
        return real_client(transport=httpx.MockTransport(handler), **kwargs)
    monkeypatch.setattr(llm.httpx, "Client", client)
    return seen_options


def test_safe_local_transport_ignores_proxies_and_sends_no_credentials(monkeypatch):
    monkeypatch.setenv("EXECFLOW_MODE", "local")
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        monkeypatch.setenv(name, "http://proxy.example.test:9999")
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": "synthetic answer"}}]})
    options = install_mock_transport(monkeypatch, handler)
    result = ChatClient("ollama", "hermes3").chat([{"role": "user", "content": "synthetic only"}])
    assert result.content == "synthetic answer"
    assert options == [{"timeout": 120.0, "trust_env": False, "follow_redirects": False}]
    assert len(requests) == 1
    assert str(requests[0].url) == "http://127.0.0.1:11434/v1/chat/completions"
    assert "authorization" not in requests[0].headers


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
def test_redirect_is_neither_followed_nor_retried(monkeypatch, status):
    monkeypatch.setenv("EXECFLOW_MODE", "local")
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(status, headers={"Location": "https://cloud.example.test/v1/chat/completions"})
    install_mock_transport(monkeypatch, handler)
    with pytest.raises(ExecutionPolicyError, match="redirects"):
        ChatClient("ollama", "hermes3").chat([])
    assert len(requests) == 1


@pytest.mark.parametrize("path,body", [
    ("/api/health", None),
    ("/api/analyse", {"dataset_id": "synthetic"}),
    ("/api/tool", {"dataset_id": "synthetic", "tool": "describe_table"}),
])
def test_bad_routing_returns_503_before_data_access(monkeypatch, path, body):
    monkeypatch.setenv("EXECFLOW_API_TOKEN", "synthetic-token")
    monkeypatch.setenv("EXECFLOW_MODEL_REPORTER", "groq:model")
    def forbidden(*args, **kwargs):
        pytest.fail("Policy failure reached data, memory or analysis")
    for name in ("_load", "list_datasets", "memory", "run_analysis"):
        monkeypatch.setattr(api, name, forbidden)
    client = TestClient(api.app, headers={"Authorization": "Bearer synthetic-token"})
    response = client.get(path) if body is None else client.post(path, json=body)
    assert response.status_code == 503
    assert response.headers["cache-control"] == "no-store"


def test_mode_tightened_during_retry_blocks_the_next_send(monkeypatch):
    monkeypatch.setenv("EXECFLOW_MODE", "local")
    requests = []
    def handler(request):
        requests.append(request)
        monkeypatch.setenv("EXECFLOW_MODE", "mock")
        return httpx.Response(503)
    install_mock_transport(monkeypatch, handler)
    monkeypatch.setattr(llm.time, "sleep", lambda _: None)
    with pytest.raises(ExecutionPolicyError):
        ChatClient("ollama", "hermes3").chat([])
    assert len(requests) == 1
