# Security policy

## Reporting a vulnerability

Please do **not** open a public issue. Use **Security, Report a vulnerability** on this repository to send a private advisory. Include what you found, how to reproduce it and the impact you expect. You will get an acknowledgement within five working days.

## Scope

In scope: the web application, `api/narrate.ts`, the Python service in `server/`, the Hermes skill and plugin in `hermes/`, and the build and CI configuration.

Particular interest:

- Anything that makes a public build contain data from `data/private/`.
- Bypassing `EXECFLOW_ACCESS_KEY` or the limits on `/api/narrate`.
- Injection through uploaded files or file-derived labels into prompts, the DOM or the API.
- Cross-site scripting, or weakening of the Content Security Policy.
- Path traversal or unsafe file handling in the Python service.

Out of scope: findings that need a modified browser, denial of service by volume against a free hosting tier, and social engineering.

## Design choices that matter for security

- The default path processes files in the browser and sends nothing.
- Only aggregates reach a model, never rows, unless `EXECFLOW_SEND_ROWS=true` on the service.
- The model key lives only in server environment variables and is never returned to the client.
- Strict Content Security Policy: same-origin scripts, styles and connections.
- No user accounts, no cookies, no analytics.

## Supported versions

The latest release on the default branch receives fixes.
