# ExecFlow reporting OS: uploaded files to verified management reports

## What it is

A second screen in ExecFlow, "Reporting", and a Python service behind it. A director or chief engineer uploads a spreadsheet, CSV, PDF or Word file, optionally asks a question, and receives:

1. Key figures and charts computed from the file.
2. Findings, each tied to evidence ids that can be re-run.
3. A management report in English or Arabic in the RMD structure: executive summary, key facts, analysis, risks and gaps, recommended actions, next steps.

Three sub-agents do the work. The **analyst** asks deterministic analytics tools for aggregates, trends, distributions and comparisons. The **reviewer** checks every number in every finding against the tool evidence and rejects anything unsupported. The **reporter** writes from confirmed findings only. Charts and KPI values are rebuilt from the evidence rows in code, so a model chooses what to show but never what the numbers are.

## Architecture

```
Browser (React, /#reporting)            Hermes Agent (optional agentic OS)
   |  upload / analyse / memory            |  execflow-reporting skill
   v                                       v
ExecFlow service  (FastAPI, server/execflow)
   ingest.py    xlsx csv tsv pdf docx  ->  tables + text        (deterministic)
   profile.py   schema, quality, candidate metrics             (deterministic)
   analytics.py aggregate trend distribution compare ...       (deterministic, evidence ids)
   agents.py    analyst -> reviewer gate -> reporter           (LLM roles)
   memory.py    SQLite + FTS5: definitions, baselines, findings, runs
   llm.py       OpenAI-compatible client: Groq, Nous, OpenRouter, Ollama, Hermes API server, mock
```

Model routing is per role, from the environment. The default is a deterministic
mock with no model network access. See [execution policy](execution-policy.md).

| Variable | Default | Purpose |
|---|---|---|
| `EXECFLOW_MODE` | `mock` | `mock` (offline) or `local` (loopback Ollama only) |
| `EXECFLOW_PROVIDER` | `mock` in mock mode; `ollama` in local mode | Default for every role |
| `EXECFLOW_MODEL_ANALYST` | Provider default | Must be mock or locally routed Ollama |
| `EXECFLOW_MODEL_REVIEWER` | Provider default | Same policy as analyst |
| `EXECFLOW_MODEL_REPORTER` | Provider default | Same policy as analyst; Hermes forwarding is disabled |
| `EXECFLOW_SEND_ROWS` | `false` | Controls row access, not the network policy |

Cloud providers and unsafe role overrides fail closed, with or without provider
keys. `OLLAMA_BASE_URL` must be a literal loopback `/v1` endpoint. Environment
proxies and redirects cannot bypass the policy. The local server must separately
have cloud functionality and outbound traffic disabled; mock is the only mode
that guarantees no model network use within ExecFlow.

## Data governance

- Raw rows are excluded from model tools by default. Profiles, text previews, aggregates and memory may still be sensitive. Use synthetic data until the local server and data-handling boundary are independently verified.
- Groq, Nous Portal, OpenRouter and Hermes model forwarding are disabled. A loopback server can itself forward requests elsewhere; local mode alone is not approval to use classified data.
- Every run stores its evidence, so any number in a report can be traced to a tool call and re-executed.
- Findings that fail verification are kept in the run as "rejected" with the reason, and excluded from the report.

## Run locally

```bash
# 1. service
python -m venv .venv && . .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e "./server[dev]"
cp .env.example .env                                   # set your runtime EXECFLOW_API_TOKEN
set -a; . ./.env; set +a                               # Windows: set each variable
cd server && python -m pytest -q && cd ..
uvicorn execflow.api:app --port 8000 --app-dir server

# 2. UI (dev) in a second terminal
npm install && npm run dev                             # http://localhost:5173/#reporting
# or build once and let the service serve it
npm run build                                          # then open http://127.0.0.1:8000/#reporting
```

Docker: `docker compose up --build` serves UI and API on loopback port 8000 with the offline example configuration. For local inference, use the native setup and the execution policy above.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Version, routing, whether the mock is active |
| POST | `/api/upload` | Multipart file; returns dataset id, profile, candidate metrics |
| GET | `/api/datasets`, `/api/datasets/{id}` | Register and runs per dataset |
| POST | `/api/tool` | Run one analytics tool directly (`{dataset_id, tool, args}`) |
| POST | `/api/analyse` | `{dataset_id, question?, lang}` runs the three agents; returns the full run |
| GET | `/api/runs`, `/api/runs/{id}`, `/api/runs/{id}/report.md` | History and report text |
| GET/POST/DELETE | `/api/memory`, `/api/memory/{id}` | Definitions, baselines, preferences, notes; `?q=` recalls by keyword |
| GET | `/api/memory.md` | Markdown mirror for Hermes or any file-based memory |

## Hermes Agent as the agentic OS

Hermes Agent (Nous Research, open source) supplies the long-lived layer: memory across sessions, skills, delegation to sub-agents, and messaging surfaces. ExecFlow supplies the numbers. Files under `hermes/`:

- `skills/reporting/execflow-reporting/` is a Hermes skill. Add the folder to `skills.external_dirs` in `~/.hermes/config.yaml`; the skill calls the service through `scripts/execflow.py` and tells the agent to quote only confirmed findings and to record definitions in both memories.
- `config.example.yaml` is an optional local-only template with its gateway disabled. Review the installed Hermes version and local server separately before use; this template is not applied automatically.
- `env.example` uses offline ExecFlow defaults and no cloud provider keys.
- `plugins/execflow/dashboard/` is disabled pending verified inbound authentication. Its routes return 503 before any upstream access. Do not inject a service credential or install it as a working proxy.

Hermes reads uploaded documents from disk paths, not through its HTTP API, so files shared in chat must be saved locally before the skill uploads them.

## Verified here, and what is not

Verified in this environment: ingestion of xlsx, csv and docx (pdf via pdfplumber is exercised by the same code path), profiling, all analytics tools, the evidence gate, memory recall and export, the API, and the full analyst, reviewer and reporter chain against a deterministic mock, both in tests and in a browser session.

Not verified here: live Ollama inference, local-server egress restrictions, or the Hermes skill against a running install. Cloud execution is disabled and the dashboard proxy intentionally remains unavailable. All new policy tests are synthetic and offline.

## Extending

- New file type: add a reader in `ingest.py` and its extension to `SUPPORTED`.
- New analytics tool: add a function and its schema in `analytics.py`; the analyst gets it automatically and the reviewer gate still applies.
- New role or model: every `EXECFLOW_MODEL_<ROLE>` must satisfy the execution policy. Adding a legacy provider name to the catalogue does not authorize or enable its network use.
- Report structure: edit `REPORTER_SYSTEM` in `agents.py` (English and Arabic).

