#!/usr/bin/env python3
"""Thin CLI over the ExecFlow analytics API for Hermes Agent.

Usage:
  execflow.py health
  execflow.py upload <file> [--name NAME]
  execflow.py analyse <dataset_id> [--question Q] [--lang en|ar]
  execflow.py report <run_id>
  execflow.py memory list [--kind KIND]
  execflow.py memory add <kind> <text>
Environment: EXECFLOW_URL (default http://127.0.0.1:8000)
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("EXECFLOW_URL", "http://127.0.0.1:8000").rstrip("/")


def call(method: str, path: str, body: dict | None = None, raw: bytes | None = None, content_type: str | None = None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", content_type or "application/json")
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            ct = r.headers.get("Content-Type", "")
            payload = r.read()
            return json.loads(payload) if "json" in ct else payload.decode()
    except urllib.error.HTTPError as e:
        sys.exit(f"ExecFlow error {e.code}: {e.read().decode()[:500]}")
    except urllib.error.URLError as e:
        sys.exit(f"ExecFlow unreachable at {BASE}: {e.reason}. Start it with: uvicorn execflow.api:app --port 8000")


def upload(path: str, name: str | None):
    boundary = uuid.uuid4().hex
    fname = os.path.basename(path)
    ctype = mimetypes.guess_type(fname)[0] or "application/octet-stream"
    with open(path, "rb") as f:
        content = f.read()
    parts = [f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{fname}\"\r\nContent-Type: {ctype}\r\n\r\n".encode(), content, b"\r\n"]
    if name:
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"name\"\r\n\r\n{name}\r\n".encode())
    parts.append(f"--{boundary}--\r\n".encode())
    res = call("POST", "/api/upload", raw=b"".join(parts), content_type=f"multipart/form-data; boundary={boundary}")
    ds = res["dataset"]
    print(f"dataset_id: {ds['id']}")
    for t in ds["tables"]:
        print(f"  table {t['name']}: {t['row_count']} rows, columns: {', '.join(t['columns'][:12])}")
    for c in res.get("candidate_metrics", []):
        print(f"  candidates in {c['table']}: metrics={c['metrics']} dates={c['date_columns']} dims={c['dimensions']}")


def analyse(ds_id: str, question: str | None, lang: str):
    res = call("POST", "/api/analyse", {"dataset_id": ds_id, "question": question, "lang": lang})
    print(f"run_id: {res['run_id']}  models: {res['models']}")
    for w in res.get("warnings", []):
        print(f"warning: {w}")
    print("\nCONFIRMED FINDINGS")
    for f in res["findings"]:
        print(f"- [{f['severity']}] {f['title']} :: {f['detail']} (evidence {', '.join(f['evidence'])})")
    print("\nKPIS")
    for k in res["kpis"]:
        print(f"- {k['label']}: {k['value']} {k.get('unit') or ''} (evidence {k['evidence']})")
    if res["rejected"]:
        print("\nREJECTED (do not quote)")
        for f in res["rejected"]:
            print(f"- {f['title']} :: {f.get('reason')}")
    print(f"\nOK: {len(res['findings'])} confirmed, {len(res['rejected'])} rejected")
    print("\nREPORT\n" + res["report_md"])


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("health")
    u = sub.add_parser("upload")
    u.add_argument("file")
    u.add_argument("--name")
    a = sub.add_parser("analyse")
    a.add_argument("dataset_id")
    a.add_argument("--question")
    a.add_argument("--lang", default="en", choices=["en", "ar"])
    r = sub.add_parser("report")
    r.add_argument("run_id")
    m = sub.add_parser("memory")
    ms = m.add_subparsers(dest="mcmd", required=True)
    ml = ms.add_parser("list")
    ml.add_argument("--kind")
    ma = ms.add_parser("add")
    ma.add_argument("kind")
    ma.add_argument("text")
    args = p.parse_args()

    if args.cmd == "health":
        h = call("GET", "/api/health")
        print(json.dumps(h["routing"], indent=2))
    elif args.cmd == "upload":
        upload(args.file, args.name)
    elif args.cmd == "analyse":
        analyse(args.dataset_id, args.question, args.lang)
    elif args.cmd == "report":
        print(call("GET", f"/api/runs/{args.run_id}/report.md"))
    elif args.cmd == "memory" and args.mcmd == "list":
        items = call("GET", "/api/memory" + (f"?kind={args.kind}" if args.kind else ""))["items"]
        for it in items:
            print(f"- [{it['kind']}] {it['text']}")
        if not items:
            print("(memory is empty)")
    elif args.cmd == "memory" and args.mcmd == "add":
        it = call("POST", "/api/memory", {"kind": args.kind, "text": args.text, "source": "hermes"})
        print(f"remembered {it['id']} [{it['kind']}]")


if __name__ == "__main__":
    main()
