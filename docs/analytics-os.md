# ExecFlow reporting OS: uploaded files to verified management reports

## What it is

The **Reporting** screen turns a file into a management report. By default it runs entirely in the browser on CSV and Excel files. A Python service adds PDF and Word support, agent reasoning and memory. A director or chief engineer opens a file, optionally asks a question, and receives:

1. Key figures and charts computed from the file.
2. Findings, each tied to evidence ids that can be re-run.
3. A management report in English or Arabic in the RMD structure: executive summary, key facts, analysis, risks and gaps, recommended actions, next steps.

In service mode, three sub-agents do the work. The **analyst** asks deterministic analytics tools for aggregates, trends, distributions and comparisons. The **reviewer** checks every number in every finding against the tool evidence and rejects anything unsupported. The **reporter** writes from confirmed findings only. Charts and KPI values are rebuilt from the evidence rows in code, so a model chooses what to show but never what the numbers are.

## Two ways to analyse

| | **On this device** (default) | **Analytics service** |
|---|---|---|
| Files | CSV, TSV, Excel | CSV, TSV, Excel, **PDF, Word** |
| Where it runs | Your browser | Your server (`server/`), Docker or local |
| Who writes the findings | Deterministic rules plus an evidence gate | Analyst, reviewer and reporter agents on open-weight models |
| Memory across runs | No | Yes: definitions, baselines, findings (SQLite) |
| Needs a server | No. Works on static hosting and offline | Yes |
| Data leaves the device | No | To your own server only |

### On this device

The engine in [`src/engine/`](../src/engine/) reads the file, infers column kinds, then runs five analyses on the largest tables: concentration of a metric across a category, trend against the previous period, which group moved most, outliers (z-score above 2.5, with the interquartile fences shown), and data gaps. Each finding cites the evidence ids of the computations behind it. Every finding is written in both languages and both must pass the gate.

The gate accepts a number only if it is in the cited evidence or is a simple derivation of it (a change, a percentage change, a share). That is deliberately generous so real findings are not rejected, which also means it is a safety net and not a proof: an invented value that happens to equal a derivation would pass. Keep the evidence ids visible and re-run the computation when a figure matters.

The report follows the department structure: executive summary, key facts, analysis, risks and gaps, recommended actions, next steps.

### Optional AI wording

When the deployment has `GROQ_API_KEY`, a **Polish with AI** button appears. The browser sends the finding titles and details, KPI values, row counts and data gaps to `/api/narrate`, never rows or the file. The returned text replaces the verified report only if every number in it already exists in what was sent. Otherwise it is discarded and the screen says why. See [Deployment](deployment.md) for the access key and limits.

Limits worth knowing: Excel files are read on the main thread, so very large workbooks take a moment; legacy `.xls` is not supported (save as `.xlsx`); text cells such as `N/A` are treated as empty; slash dates are read day first unless the column proves otherwise; Arabic text carries invisible left-to-right marks around Latin tokens, which show up if you paste it into a plain-text editor.

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

## Verified, and what is not

Verified in automated tests: browser parsing of CSV and Excel, profiling, every analytics tool, the evidence gate (including rejection of a fabricated number), the rules-based analyst, bilingual report headings, the narration check, the serverless function (validation, access key, rate limit, no key leakage, upstream failure handling), and in the Python service the ingestion, tools, memory, API and the analyst, reviewer and reporter chain against a deterministic mock.

Verified in a browser session: opening the Reporting screen with the sample file, loading a real `.xlsx`, switching the report to Arabic, and the clear message for PDF and Word files.

Not verified from the build environment, which has no outbound route to model providers: live Ollama inference, local-server egress restrictions, the deployed `/api/narrate` against Groq, and the Hermes skill against a running install. Run one analysis and `hermes skills list` on your side to confirm.

Two execution policies apply, and they differ on purpose:

- **Python service** (this document, sections above): offline by default. `EXECFLOW_MODE=mock` is the default and `local` allows only loopback Ollama. Cloud providers, Hermes model forwarding and the dashboard proxy are disabled in code. See [execution policy](execution-policy.md) and [API security](api-security.md).
- **`/api/narrate`** (optional Vercel function): off unless `GROQ_API_KEY` is set on your own deployment. It receives aggregate finding text and KPI values only, never rows, and is the only code path that can call a cloud model. If your policy forbids cloud models, do not set the key and the function stays disabled. Treat this as a decision for the data owner, not a default.

## Extending

- New file type: add a reader in `ingest.py` and its extension to `SUPPORTED`.
- New analytics tool: add a function and its schema in `analytics.py`; the analyst gets it automatically and the reviewer gate still applies.
- New role or model: every `EXECFLOW_MODEL_<ROLE>` must satisfy the execution policy. Adding a legacy provider name to the catalogue does not authorize or enable its network use.
- Report structure: edit `REPORTER_SYSTEM` in `agents.py` (English and Arabic).

