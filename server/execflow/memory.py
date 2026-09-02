"""Persistent memory: datasets, runs, findings, KPI definitions, preferences.

SQLite with FTS5 so the analyst can recall prior findings and agreed
definitions by keyword. A Markdown mirror is exported for Hermes Agent,
whose own memory reads plain files."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

KINDS = {"definition", "finding", "preference", "note", "baseline"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL, question TEXT, lang TEXT,
  status TEXT NOT NULL, created_at TEXT NOT NULL, finished_at TEXT, result TEXT
);
CREATE TABLE IF NOT EXISTS memory (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, text TEXT NOT NULL, source TEXT,
  dataset_id TEXT, created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
"""
FTS = "CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(text, kind, id UNINDEXED);"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Memory:
    def __init__(self, path: Path | str = ":memory:"):
        self.path = str(path)
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        try:
            self.conn.execute(FTS)
            self.fts = True
        except sqlite3.OperationalError:
            self.fts = False
        self.conn.commit()

    # ---------------------------------------------------------------- memory
    def remember(self, kind: str, text: str, source: str | None = None, dataset_id: str | None = None) -> dict:
        if kind not in KINDS:
            raise ValueError(f"kind must be one of {sorted(KINDS)}")
        text = text.strip()
        if not text:
            raise ValueError("empty memory")
        mid = uuid.uuid4().hex[:12]
        self.conn.execute(
            "INSERT INTO memory (id, kind, text, source, dataset_id, created_at) VALUES (?,?,?,?,?,?)",
            (mid, kind, text, source, dataset_id, _now()),
        )
        if self.fts:
            self.conn.execute("INSERT INTO memory_fts (text, kind, id) VALUES (?,?,?)", (text, kind, mid))
        self.conn.commit()
        return self.get(mid)

    def forget(self, mid: str) -> bool:
        cur = self.conn.execute("UPDATE memory SET active = 0 WHERE id = ?", (mid,))
        if self.fts:
            self.conn.execute("DELETE FROM memory_fts WHERE id = ?", (mid,))
        self.conn.commit()
        return cur.rowcount > 0

    def get(self, mid: str) -> dict:
        row = self.conn.execute("SELECT * FROM memory WHERE id = ?", (mid,)).fetchone()
        return dict(row) if row else {}

    def list(self, kind: str | None = None, limit: int = 200) -> list[dict]:
        q = "SELECT * FROM memory WHERE active = 1" + (" AND kind = ?" if kind else "") + " ORDER BY created_at DESC LIMIT ?"
        args = ([kind] if kind else []) + [limit]
        return [dict(r) for r in self.conn.execute(q, args)]

    def recall(self, query: str, k: int = 8, kind: str | None = None) -> list[dict]:
        """Keyword recall. FTS5 with OR-joined terms, LIKE fallback."""
        terms = [t for t in "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in query).split() if len(t) > 2]
        if not terms:
            return self.list(kind, k)
        if self.fts:
            match = " OR ".join(f'"{t}"' for t in terms[:12])
            rows = self.conn.execute(
                "SELECT m.* FROM memory_fts f JOIN memory m ON m.id = f.id WHERE memory_fts MATCH ? AND m.active = 1"
                + (" AND m.kind = ?" if kind else "")
                + " ORDER BY bm25(memory_fts) LIMIT ?",
                ([match] + ([kind] if kind else []) + [k]),
            ).fetchall()
            return [dict(r) for r in rows]
        like = " OR ".join("text LIKE ?" for _ in terms)
        rows = self.conn.execute(
            f"SELECT * FROM memory WHERE active = 1 AND ({like})" + (" AND kind = ?" if kind else "") + " LIMIT ?",
            [f"%{t}%" for t in terms] + ([kind] if kind else []) + [k],
        ).fetchall()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------------ runs
    def start_run(self, dataset_id: str, question: str | None, lang: str) -> str:
        rid = uuid.uuid4().hex[:12]
        self.conn.execute(
            "INSERT INTO runs (id, dataset_id, question, lang, status, created_at) VALUES (?,?,?,?,?,?)",
            (rid, dataset_id, question, lang, "running", _now()),
        )
        self.conn.commit()
        return rid

    def finish_run(self, rid: str, status: str, result: dict) -> None:
        self.conn.execute(
            "UPDATE runs SET status = ?, finished_at = ?, result = ? WHERE id = ?",
            (status, _now(), json.dumps(result, ensure_ascii=False, default=str), rid),
        )
        self.conn.commit()

    def get_run(self, rid: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM runs WHERE id = ?", (rid,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["result"] = json.loads(d["result"]) if d["result"] else None
        return d

    def list_runs(self, dataset_id: str | None = None, limit: int = 50) -> list[dict]:
        q = "SELECT id, dataset_id, question, lang, status, created_at, finished_at FROM runs" + (" WHERE dataset_id = ?" if dataset_id else "") + " ORDER BY created_at DESC LIMIT ?"
        return [dict(r) for r in self.conn.execute(q, ([dataset_id] if dataset_id else []) + [limit])]

    # ---------------------------------------------------------------- export
    def export_markdown(self) -> str:
        lines = ["# ExecFlow memory", "", "Curated by the ExecFlow reporting agents. One line per item; newest first.", ""]
        for kind in ("definition", "baseline", "preference", "finding", "note"):
            items = self.list(kind, 100)
            if not items:
                continue
            lines.append(f"## {kind.title()}s")
            for m in items:
                src = f" (source: {m['source']})" if m.get("source") else ""
                lines.append(f"- {m['text']}{src} [{m['created_at'][:10]}]")
            lines.append("")
        return "\n".join(lines)
