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

Model routing is per role, from the environment:

| Variable | Default | Purpose |
|---|---|---|
| `EXECFLOW_PROVIDER` | `groq` | Default provider for every role |
| `EXECFLOW_MODEL_ANALYST` | `groq:openai/gpt-oss-120b` | Tool-calling analysis |
| `EXECFLOW_MODEL_REVIEWER` | `groq:openai/gpt-oss-20b` | Verdict on each finding (after the deterministic gate) |
| `EXECFLOW_MODEL_REPORTER` | `groq:openai/gpt-oss-120b` | Report writing (`hermes:hermes-agent` routes it through Hermes and its memory) |
| `EXECFLOW_SEND_ROWS` | `false` | When false, only schema, profiles and aggregates reach a model |

Providers and their key variables: `groq` (`GROQ_API_KEY`), `nous` (`NOUS_API_KEY`, Hermes 4), `openrouter` (`OPENROUTER_API_KEY`), `ollama` (no key, `http://127.0.0.1:11434/v1`), `hermes` (`API_SERVER_KEY`, `http://127.0.0.1:8642/v1`). Any base URL can be overridden with `<PROVIDER>_BASE_URL`. With no key configured the service runs a deterministic mock and says so in the UI.

Model ids were taken from Groq's published catalogue in September 2026 (gpt-oss-120b and gpt-oss-20b, both with tool use and JSON mode). Confirm current ids at console.groq.com/docs/models before the first live run; older Llama 3.x ids are deprecated there.

## Data governance

- Raw rows stay on the machine by default. The analyst sees column names, kinds, null counts, ranges, top categories and the aggregates it asks for. Set `EXECFLOW_SEND_ROWS=true` only for data that may leave the organisation.
- Groq, Nous Portal and OpenRouter are external cloud services. For RTA data classified above public, run the `ollama` provider (local) or route through a self-hosted Hermes Agent. The pipeline is identical; only the base URL changes.
- Every run stores its evidence, so any number in a report can be traced to a tool call and re-executed.
- Findings that fail verification are kept in the run as "rejected" with the reason, and excluded from the report.

## Run locally

```bash
# 1. service
python -m venv .venv && . .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e "./server[dev]"
cp .env.example .env                                   # add GROQ_API_KEY
set -a; . ./.env; set +a                               # Windows: set each variable
cd server && python -m pytest -q && cd ..
uvicorn execflow.api:app --port 8000 --app-dir server

# 2. UI (dev) in a second terminal
npm install && npm run dev                             # http://localhost:5173/#reporting
# or build once and let the service serve it
npm run build                                          # then open http://127.0.0.1:8000/#reporting
```

Docker: `docker compose up --build` serves UI and API on port 8000. `docker compose --profile local up` adds Ollama.

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
- `config.example.yaml` shows the intended split: orchestrator on a Hermes 4 model (Nous Portal) or on Groq, `delegate_task` children pinned to Groq through `delegation.base_url`, the API server enabled on port 8642.
- `env.example` lists the keys for both sides.
- `plugins/execflow/dashboard/` is a drop-in tab for the Hermes web dashboard (`hermes dashboard`): copy to `~/.hermes/plugins/execflow/`, it lists datasets, runs an analysis and shows the latest confirmed findings and report through a small FastAPI proxy.

Hermes reads uploaded documents from disk paths, not through its HTTP API, so files shared in chat must be saved locally before the skill uploads them.

## Verified here, and what is not

Verified in this environment: ingestion of xlsx, csv and docx (pdf via pdfplumber is exercised by the same code path), profiling, all analytics tools, the evidence gate, memory recall and export, the API, and the full analyst, reviewer and reporter chain against a deterministic mock, both in tests and in a browser session.

Not verified here: live calls to Groq, Nous Portal or Ollama (no outbound route from the build sandbox), the Hermes skill and dashboard plugin against a running Hermes install. Both were written against Hermes' own documentation in its repository; run `hermes skills list` and open the dashboard tab to confirm on your machine.

## Extending

- New file type: add a reader in `ingest.py` and its extension to `SUPPORTED`.
- New analytics tool: add a function and its schema in `analytics.py`; the analyst gets it automatically and the reviewer gate still applies.
- New role or model: add a provider to `PROVIDERS` in `llm.py` or set `EXECFLOW_MODEL_<ROLE>`.
- Report structure: edit `REPORTER_SYSTEM` in `agents.py` (English and Arabic).
