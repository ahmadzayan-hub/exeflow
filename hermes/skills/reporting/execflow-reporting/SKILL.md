---
name: execflow-reporting
description: Turn an uploaded spreadsheet, CSV, PDF or Word file into a verified management report using the ExecFlow analytics service (upload, analyse, read findings, recall and record memory).
version: 0.1.0
author: Ahmed Zaian, ExecFlow
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Reporting, Analytics, Management, Railway, RMD]
    related_skills: []
    requires_tools: [terminal]
    config:
      - key: execflow.url
        description: "Base URL of the ExecFlow analytics service"
        default: "http://127.0.0.1:8000"
        prompt: "ExecFlow service URL"
required_environment_variables:
  - name: EXECFLOW_URL
    prompt: "ExecFlow analytics service URL (default http://127.0.0.1:8000)"
    help: "Start the service with: uvicorn execflow.api:app --port 8000 (see docs/analytics-os.md)"
    required_for: "reaching the analytics service"
---

# ExecFlow reporting

Use this skill when the user asks for a management report, KPI summary, trend, or findings from a data file (xlsx, csv, tsv, pdf, docx), or asks a question that must be answered from numbers in a file.

ExecFlow does the numeric work. It profiles the file, an analyst sub-agent computes aggregates with deterministic tools, a reviewer checks every figure against the data, and a reporter writes the report. You never compute or invent figures yourself: every number you repeat must come from the ExecFlow result.

## Quick reference

All commands use the helper script. Replace the path with the file the user gave you.

    python ${HERMES_SKILL_DIR}/scripts/execflow.py health
    python ${HERMES_SKILL_DIR}/scripts/execflow.py upload "/path/to/file.xlsx"
    python ${HERMES_SKILL_DIR}/scripts/execflow.py analyse <dataset_id> --lang en --question "..."
    python ${HERMES_SKILL_DIR}/scripts/execflow.py report <run_id>
    python ${HERMES_SKILL_DIR}/scripts/execflow.py memory list
    python ${HERMES_SKILL_DIR}/scripts/execflow.py memory add definition "TSA target is 99% with a 94% cap per RTA-LETTER-005426"

## Procedure

1. Run `health`. If it fails, tell the user the service is down and how to start it. Do not attempt the analysis another way.
2. `upload` the file. Note the `dataset_id`, the tables found, and the candidate metrics. If the file produced no tables, say so; a scanned PDF has no text layer.
3. If the user's question mentions a KPI, contract or term, run `memory list` and use any matching definition or baseline in the question you pass to `analyse`.
4. Run `analyse` with the user's question and the language they want (`en` or `ar`). It takes 20 to 90 seconds on Groq.
5. Reply with: the confirmed findings (title, one line of detail, evidence id), the KPI values, then the report text from `report`. Mention how many findings the reviewer rejected and why, in one line.
6. If the user states a definition, baseline or preference that should apply to future runs, record it with `memory add <kind> "<text>"`. Kinds: definition, baseline, preference, note. Also add the one-line version to your own memory tool so you recall it without the service.

## Pitfalls

- The service reads local files by path. Files sent through chat must be saved to disk first.
- Raw rows are not sent to the model provider by default (`EXECFLOW_SEND_ROWS=false`). Only schema, profiles and aggregates leave the machine. Do not work around this.
- A finding in `rejected` is not a fact. Never quote it.
- Arabic reports are returned in `report_md`; keep the Markdown headings when relaying.

## Verification

`analyse` output contains `evidence` keyed by id. A finding is usable only when every id it cites exists there. The script prints `OK: n confirmed, m rejected`; if n is 0, report that the data did not support any finding rather than improvising.
