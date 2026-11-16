# Data model

The register is one JSON document. The TypeScript source of truth is [`src/types.ts`](../src/types.ts); an importer validates structure before accepting a file, so a malformed file is rejected instead of breaking the app.

```jsonc
{
  "schemaVersion": 1,
  "title": { "en": "…", "ar": "…" },
  "organisation": { "en": "…", "ar": "…" },
  "dataset": "imported",              // showcase | seed | working | imported
  "reportingPeriod": {
    "label": { "en": "September 2026", "ar": "سبتمبر 2026" },
    "start": "2026-09-01", "end": "2026-09-30",   // optional, drives "Closed this period"
    "asOf": "2026-09-30"
  },
  "disclaimer": { "en": "…", "ar": "…" },
  "inbox": [ /* attention items without a project */ ],
  "projects": [ /* see below */ ]
}
```

## Project

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique. |
| `kind` | `project` or `contract` | Contracts ending within 90 days raise a renewal decision. |
| `code` | string or null | Contract or tracking reference. |
| `name` | `{en, ar?}` | |
| `asset` | `metro`, `tram`, `both` | |
| `category` | `signalling`, `telecom`, `power`, `consultancy`, `civil`, `energy`, `maintenance`, `asset-management` | |
| `stage` | `planning` … `closed` | |
| `contractor`, `consultant` | string or null | |
| `valueAed`, `spentAed` | number or null | Null is shown as TBC and never summed as zero. |
| `ntp`, `completion`, `dlpEnd` | ISO date or null | Start, planned completion, end of defects liability. |
| `progress` | `{planned, actual, asOf}` | Percentages 0 to 100, either may be null. |
| `workPackages` | list | `{code, title, valueAed}` |
| `milestones` | list | `{id, title, planned, actual, status: done/open/at-risk}` |
| `risks` | list | `{id, title, rating: high/medium/low, owner?, mitigation?}` |
| `attention` | list | Items, below. |
| `sources` | list of strings | Where the facts came from. |
| `confidence` | `verified`, `tbc`, `illustrative` | Shown on every card. |

## Attention item

| Field | Notes |
|---|---|
| `type` | `decision` (needs the director), `waiting` (owed by someone else), `info` |
| `owner`, `due`, `reference` | Optional. An open item with a past `due` is overdue. |
| `status` | `open` or `closed`; `closedOn` feeds the *Closed this period* tile. |
| `priority` | `high` or `normal`. |
| `capturedFrom` | The original text when the item came from Quick capture. |

## Starting from an example

[`data/register.example.json`](../data/register.example.json) is a complete, fictional register you can edit. Import it from **Data, then Import JSON**.
