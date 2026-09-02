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

## Roadmap

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

