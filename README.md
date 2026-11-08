# ExecFlow

## Product Authority

| | |
|---|---|
| **Primary User** | Director / executive |
| **Job To Be Done** | Capture executive commitments and drive them to closure |
| **System of Record** | Executive decisions · commitments · owners · due dates · follow-ups |
| **System of Intelligence** | Extraction from meetings/voice/email, escalation, weekly director brief |
| **Explicit Non-Goals** | Project-management suite (not Jira) · document analysis (→ Mutabasir) · KPI management (→ Annual Plan) |

> "ماذا قررنا؟ من المسؤول؟ متى يجب أن ينتهي؟ ماذا تأخر؟ وما الذي يحتاج تدخل المدير الآن؟"

Mutabasir answers *what do the documents say*; ExecFlow owns *what we
decided and whether it closed*.

## Voice-first capture

A director walks out of a meeting and says:

> «سجّل إن علي لازم يراجع عرض المقاول قبل الخميس، وعايز رد من المالية على الدفعة السابعة.»

ExecFlow turns it into `Decision · Action · Owner · Due date ·
Dependency · Priority · Evidence` — linked to email, calendar, meeting
minutes, a Mutabasir brief, a VERTEX issue, or an Annual Plan KPI.

## The director's home screen

```
NEEDS MY DECISION    5
WAITING FOR OTHERS   8
OVERDUE              3
CLOSED THIS WEEK    17
```

## Reporting from uploaded files (analytics OS)

`/#reporting` turns a spreadsheet, CSV, PDF or Word file into key figures, charts, verified findings and a management report in English or Arabic. Three sub-agents (analyst, reviewer, reporter) run on a deterministic offline mock by default. Optional local mode permits only loopback Ollama; cloud providers, Hermes model forwarding and unsafe per-role overrides are rejected before any request. Numbers come only from deterministic tools; a reviewer gate rejects any figure that is not in the evidence. Memory (definitions, baselines, findings) persists in SQLite and is exported as Markdown for Hermes Agent. See `docs/analytics-os.md` and the Hermes skill under `hermes/`.

Set the runtime `EXECFLOW_API_TOKEN` before starting the analytics service, then
enter it in the Reporting screen. See [API security](docs/api-security.md) for
setup, HTTPS requirements and the single-operator access boundary.

```bash
pip install -e "./server[dev]" && uvicorn execflow.api:app --port 8000 --app-dir server
npm run build   # the service serves the built UI at http://127.0.0.1:8000
```

## Roadmap

`/#commitments` now provides an offline slice of this workflow: labelled
English/Arabic text minutes → explicit source review → a browser-local register
→ closure tracking and a downloadable weekly brief. Owners and dates are copied
only from explicit fields; ambiguous or unlabelled lines are reported for
correction. No model, microphone, email/calendar connection or server is used.
See [commitment capture](docs/commitment-capture.md) for the supported grammar,
backup/restore, validation and remaining roadmap boundaries.

- **P0 · Capture → Register** — voice/text/minutes → full register with
  owners and due dates, no manual re-entry.
- **P1 · Closure loop** — follow-ups, escalation, weekly director brief,
  `executive.action_overdue` domain event.
- **Start rule** — one user (the director), one workflow (meeting →
  register → weekly brief), one KPI before any expansion.

## KPIs

`closure rate` · `decision/action lead time`

## RMD Projects Executive Dashboard (first screen)

Executive view of the Rail Maintenance Department project and contract
portfolio: director tiles, computed schedule health, a director attention
list (decisions, overdue, waiting), bilingual EN/AR with RTL, print, and JSON
import/export. Ships as one self-contained HTML file.

```bash
npm ci && npm test && npm run build   # dist/rmd-dashboard.html
```

See [docs/rmd-dashboard.md](docs/rmd-dashboard.md) for the data rules and
the monthly update cycle.



## Local Windows distribution

[ExecFlow 0.3.0 local prerelease](https://github.com/ahmadzayan-hub/exeflow/releases/tag/v0.3.0) provides the fixed-origin launcher, reviewed commitment capture/recovery, director follow-up indicators, search and filters. The release is published only after Windows and Linux CI pass, including extracting and running the actual package. Its portfolio is empty demonstration data; import approved JSON locally. Node.js LTS 22+ remains a prerequisite.

Read [release scope and installation](docs/Release%20Scope.md). This completes the local labelled-text meeting/register/brief workflow; local voice/interpretation, Microsoft Graph mail/calendar and automatic reminder/escalation submission are implemented through the local runtime, with explicit setup and review. See [local integrations](docs/Local%20Integrations.md). Live account consent, delivery and user-device speech acceptance remain operational gates; no successful live integration is inferred from synthetic tests.

```text
npm run build:release
npm run package:windows
```
