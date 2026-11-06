# Analytics API authentication

Every `/api` request requires `Authorization: Bearer <token>`, including health,
reports and memory exports. Docs/OpenAPI require the same credential. Missing or
blank `EXECFLOW_API_TOKEN` fails closed with 503; invalid credentials return 401.
Only CORS preflight and static dashboard assets remain public. CORS is not auth.

Before starting the service, the operator must set a strong unique
`EXECFLOW_API_TOKEN` in the runtime environment (or ignored `.env` for Compose).
No credential is supplied, generated or deployed by this change. Never commit a
real token or set it as a `VITE_` build variable. Restart the service after rotating
the environment value, then reconnect clients with the new token.

The Reporting screen accepts the token at runtime, holds it only in JavaScript
memory, and clears it when the page reloads or Disconnect is selected. Use HTTPS
except for loopback development, and verify `VITE_API_BASE` before entering a token:
it must point only to your trusted service. Do not put tokens in URLs or cookies.
The standalone synthetic dashboard remains usable without the analytics service.

The Hermes CLI reads `EXECFLOW_API_TOKEN` from its own environment. The optional
Hermes dashboard proxy is disabled in code: all implemented routes return 503
before any upstream action, even if an environment token or enable flag is present.
No upstream client or credential forwarding exists in the proxy. Enabling it
requires a separately reviewed implementation that validates the host's inbound
identity and authorization before credential access, followed by negative tests
against unauthenticated and unauthorized callers. It was not enabled or tested
against a running Hermes install.

Model execution defaults to `EXECFLOW_MODE=mock` (zero network). The only other
supported mode is `local`, limited to local Ollama. See
[execution policy](execution-policy.md) for the guards and local-server limits.

Compose binds ExecFlow to loopback by default. Remote access needs an explicitly
reviewed TLS/auth deployment. Do not expose the service over plaintext HTTP.

This is a single-operator boundary, not multi-user/tenant authorization. Every
holder has full access to all datasets, analysis and memory. Before shared or
production deployment, review per-user authorization, rate/upload limits, TLS,
proxy authentication, logging redaction, backups and token rotation. The upload
size check still occurs after reading the authenticated upload and is not a
streaming resource limit. Static bundled/imported portfolio data is outside this
API boundary; use synthetic data in publicly served builds.

Validation: `cd server && python -m pytest -q`; `npm test`; `npm run typecheck`;
`npm run build`. Authentication tests cover every current API surface, missing
configuration, invalid credentials, preflight, duplicate headers and rotation.
