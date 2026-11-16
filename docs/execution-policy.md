# Offline and local execution policy

ExecFlow supports two modes. There is no cloud/paid enable flag.

- `EXECFLOW_MODE=mock` is the default: all roles use deterministic synthetic
  clients and no model network request is made. Supplying a cloud key does not
  change the mode. Old cloud provider or per-role settings are rejected, not
  silently replaced or retried elsewhere.
- `EXECFLOW_MODE=local` allows only mock or Ollama roles. The default provider in
  this mode is Ollama, but an explicit `EXECFLOW_PROVIDER=mock` still stays mock.
  Every role, including orchestrator and unused overrides, is validated before
  analysis. Hermes model forwarding is rejected because its downstream routing
  could invoke a paid/cloud model even when the Hermes API itself is on loopback.

Example for an independently prepared native local server:

```sh
EXECFLOW_MODE=local
EXECFLOW_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
EXECFLOW_MODEL_ANALYST=ollama:hermes3
EXECFLOW_MODEL_REVIEWER=ollama:hermes3
EXECFLOW_MODEL_REPORTER=ollama:hermes3
```

The client accepts only literal loopback IP addresses (`127.x.x.x` or `::1`) and
an HTTP(S) `/v1` path, with no credentials, query, fragment or control characters.
DNS hostnames (including `localhost` and Docker service names), private-LAN,
public, metadata and wildcard addresses are rejected. The final send is checked
again, environment proxies are ignored, redirects are rejected without following
or retrying them, and no API/service credential is attached to model traffic.
Cloud-marked Ollama model names are rejected. Invalid configuration returns 503
on API health, analysis and tool routes, before dataset or memory access there.
Existing API authentication remains required.

## Local-server trust boundary

Loopback is not proof that inference stays local. ExecFlow cannot inspect or
control another process's routing, aliases or plugins. Before local mode is
used, the operator must independently disable Ollama cloud features (for versions
that support it, `OLLAMA_NO_CLOUD=1` in the **Ollama server** environment), use a
locally installed model, and deny that server outbound network access. Do not
point this client at a tunnel or forwarding proxy. No server setting, firewall,
model download, gateway, service or monitoring process is changed by this patch.
Only mock mode provides zero network use entirely within this application.

The Compose example is offline/mock-oriented. A separate Docker service name is
not loopback; use the documented native setup for local mode rather than weakening
the URL check. Do not run real or classified data through an unverified local
server. Disabling raw rows alone is insufficient: schemas, text, aggregates and
memory can also contain sensitive information.

## Hermes dashboard

The optional dashboard proxy is disabled in code, regardless of token or enable
flags. All implemented routes return 503 without reading credentials or calling
upstream. A future integration requires independently verified inbound identity
and authorization, a reviewed credential boundary, and negative auth tests before
it can be enabled. This change neither enables nor restarts Hermes monitoring.

## Offline validation

Run `cd server && python -m pytest -q`, `npm test`, `npm run typecheck` and
`npm run build`. Backend tests forbid socket connections and DNS. Local transport
and redirect tests use `httpx.MockTransport`, and API/plugin tests use in-process
ASGI clients with synthetic tokens and data. No live model, Hermes install,
production deployment, or network-level egress policy has been verified.
