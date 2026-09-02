"""Hermes dashboard backend routes for the ExecFlow tab.
Mounted at /api/plugins/execflow/. Proxies the ExecFlow analytics service so the
dashboard never needs a second origin or a second auth token."""

import json
import os
import urllib.request

from fastapi import APIRouter, HTTPException

router = APIRouter()
BASE = os.environ.get("EXECFLOW_URL", "http://127.0.0.1:8000").rstrip("/")


def _get(path: str):
    try:
        with urllib.request.urlopen(f"{BASE}{path}", timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:  # service down or bad path
        raise HTTPException(502, f"ExecFlow unreachable at {BASE}: {e}")


def _post(path: str, body: dict):
    req = urllib.request.Request(f"{BASE}{path}", data=json.dumps(body).encode(), method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.loads(r.read())
    except Exception as e:
        raise HTTPException(502, f"ExecFlow request failed: {e}")


@router.get("/overview")
async def overview():
    health = _get("/api/health")
    datasets = _get("/api/datasets")["datasets"]
    runs = _get("/api/runs")["runs"][:10]
    latest = _get(f"/api/runs/{runs[0]['id']}")["result"] if runs else None
    return {"health": health, "datasets": datasets, "runs": runs, "latest": latest}


@router.get("/runs/{run_id}")
async def run(run_id: str):
    return _get(f"/api/runs/{run_id}")


@router.post("/analyse")
async def analyse(body: dict):
    return _post("/api/analyse", {"dataset_id": body.get("dataset_id"), "question": body.get("question"), "lang": body.get("lang", "en")})
