"""HTTP surface used by the ExecFlow UI and by Hermes Agent (via the
execflow-reporting skill). Run: uvicorn execflow.api:app --port 8000"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__
from .agents import run_analysis
from .analytics import TOOL_SCHEMAS, run_tool
from .ingest import SUPPORTED, ingest, list_datasets, load_dataset, save_dataset
from .llm import load_routing
from .memory import KINDS, Memory
from .profile import candidate_metrics, profile_dataset

DATA_ROOT = Path(os.environ.get("EXECFLOW_DATA", "data"))
DATASETS = DATA_ROOT / "datasets"
MAX_UPLOAD_MB = int(os.environ.get("EXECFLOW_MAX_UPLOAD_MB", "25"))

app = FastAPI(title="ExecFlow analytics", version=__version__)
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("EXECFLOW_CORS", "http://localhost:5173").split(","), allow_methods=["*"], allow_headers=["*"])

_memory: Memory | None = None


def memory() -> Memory:
    global _memory
    if _memory is None:
        DATA_ROOT.mkdir(parents=True, exist_ok=True)
        _memory = Memory(DATA_ROOT / "execflow.db")
    return _memory


def _load(ds_id: str):
    try:
        return load_dataset(ds_id, DATASETS)
    except FileNotFoundError:
        raise HTTPException(404, f"dataset {ds_id} not found")


class AnalyseIn(BaseModel):
    dataset_id: str
    question: str | None = None
    lang: str = Field("en", pattern="^(en|ar)$")


class ToolIn(BaseModel):
    dataset_id: str
    tool: str
    args: dict = Field(default_factory=dict)


class MemoryIn(BaseModel):
    kind: str
    text: str
    source: str | None = None


@app.get("/api/health")
def health():
    r = load_routing()
    return {"version": __version__, "routing": r.describe(), "supported_files": sorted(SUPPORTED), "datasets": len(list_datasets(DATASETS)), "data_root": str(DATA_ROOT)}


@app.post("/api/upload")
async def upload(file: UploadFile = File(...), name: str | None = Form(None)):
    data = await file.read()
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"file exceeds {MAX_UPLOAD_MB} MB")
    try:
        ds = ingest(file.filename or "upload", data, name)
    except ValueError as e:
        raise HTTPException(400, str(e))
    save_dataset(ds, DATASETS)
    return {"dataset": ds.meta(), "profile": profile_dataset(ds), "candidate_metrics": candidate_metrics(profile_dataset(ds))}


@app.get("/api/datasets")
def datasets():
    return {"datasets": list_datasets(DATASETS)}


@app.get("/api/datasets/{ds_id}")
def dataset(ds_id: str):
    ds = _load(ds_id)
    p = profile_dataset(ds)
    return {"dataset": ds.meta(), "profile": p, "candidate_metrics": candidate_metrics(p), "runs": memory().list_runs(ds_id)}


@app.get("/api/tools")
def tools():
    return {"tools": TOOL_SCHEMAS}


@app.post("/api/tool")
def tool(body: ToolIn):
    ds = _load(body.dataset_id)
    try:
        return run_tool(ds, body.tool, body.args, allow_rows=load_routing().allow_rows)
    except (ValueError, KeyError, PermissionError) as e:
        raise HTTPException(400, str(e))


@app.post("/api/analyse")
def analyse(body: AnalyseIn):
    ds = _load(body.dataset_id)
    try:
        result = run_analysis(ds, memory(), load_routing(), body.question, body.lang)
    except RuntimeError as e:  # provider failure
        raise HTTPException(502, str(e))
    return result.to_dict()


@app.get("/api/runs")
def runs(dataset_id: str | None = None):
    return {"runs": memory().list_runs(dataset_id)}


@app.get("/api/runs/{run_id}")
def run(run_id: str):
    r = memory().get_run(run_id)
    if not r:
        raise HTTPException(404, "run not found")
    return r


@app.get("/api/runs/{run_id}/report.md", response_class=PlainTextResponse)
def report(run_id: str):
    r = memory().get_run(run_id)
    if not r or not r.get("result"):
        raise HTTPException(404, "run not found")
    return r["result"].get("report_md", "")


@app.get("/api/memory")
def memory_list(kind: str | None = None, q: str | None = None):
    m = memory()
    return {"items": m.recall(q, 20, kind) if q else m.list(kind)}


@app.post("/api/memory")
def memory_add(body: MemoryIn):
    if body.kind not in KINDS:
        raise HTTPException(400, f"kind must be one of {sorted(KINDS)}")
    return memory().remember(body.kind, body.text, body.source)


@app.delete("/api/memory/{mid}")
def memory_del(mid: str):
    if not memory().forget(mid):
        raise HTTPException(404, "memory item not found")
    return {"ok": True}


@app.get("/api/memory.md", response_class=PlainTextResponse)
def memory_md():
    return memory().export_markdown()


# Serve the built UI (npm run build -> ../dist) from the same process when present.
_UI = Path(os.environ.get("EXECFLOW_UI_DIST", Path(__file__).resolve().parents[2] / "dist"))
if _UI.is_dir():
    app.mount("/", StaticFiles(directory=str(_UI), html=True), name="ui")
