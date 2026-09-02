"""Analytics tools the agents may call. Every call is a pure function of the
dataset and its JSON arguments, so the reviewer can re-run a call and confirm
the number an analyst quoted. Results carry an evidence id for that purpose."""

from __future__ import annotations

import hashlib
import json
from typing import Any

import pandas as pd

from .ingest import Dataset

AGGS = {"sum", "mean", "count", "min", "max", "median", "nunique"}
FREQS = {"D": "D", "W": "W", "M": "ME", "Q": "QE", "Y": "YE"}
MAX_ROWS = 60


def evidence_id(tool: str, args: dict) -> str:
    return hashlib.sha1(json.dumps({"tool": tool, "args": args}, sort_keys=True, default=str).encode()).hexdigest()[:10]


def _records(df: pd.DataFrame, limit: int = MAX_ROWS) -> list[dict]:
    df = df.head(limit).copy()
    for c in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[c]):
            df[c] = df[c].dt.strftime("%Y-%m-%d")
    out = []
    for rec in df.to_dict(orient="records"):
        out.append({str(k): (None if pd.isna(v) else (v.item() if hasattr(v, "item") else v)) for k, v in rec.items()})
    return out


def _apply_filters(df: pd.DataFrame, filters: list[dict] | None) -> pd.DataFrame:
    for f in filters or []:
        col, op, val = f["column"], f.get("op", "eq"), f.get("value")
        if col not in df.columns:
            raise ValueError(f"unknown column '{col}'")
        s = df[col]
        if op == "eq":
            df = df[s.astype("string") == str(val)] if not pd.api.types.is_numeric_dtype(s) else df[s == val]
        elif op == "ne":
            df = df[s.astype("string") != str(val)] if not pd.api.types.is_numeric_dtype(s) else df[s != val]
        elif op == "in":
            df = df[s.astype("string").isin([str(v) for v in val])]
        elif op in {"gt", "gte", "lt", "lte"}:
            if pd.api.types.is_datetime64_any_dtype(s):
                val = pd.to_datetime(val)
            comp = {"gt": s > val, "gte": s >= val, "lt": s < val, "lte": s <= val}[op]
            df = df[comp]
        elif op == "contains":
            df = df[s.astype("string").str.contains(str(val), case=False, na=False)]
        else:
            raise ValueError(f"unknown filter op '{op}'")
    return df


def _check(df: pd.DataFrame, *cols: str | None) -> None:
    for c in cols:
        if c is not None and c not in df.columns:
            raise ValueError(f"unknown column '{c}'; available: {list(map(str, df.columns))[:40]}")


def list_tables(ds: Dataset) -> dict:
    return {"tables": [{"name": t.name, "row_count": t.row_count, "columns": t.columns} for t in ds.tables]}


def describe_table(ds: Dataset, table: str) -> dict:
    from .profile import profile_table

    return profile_table(ds.table(table))


def aggregate(
    ds: Dataset,
    table: str,
    metric: str,
    agg: str = "sum",
    group_by: str | None = None,
    filters: list[dict] | None = None,
    top_n: int | None = None,
    sort: str = "desc",
) -> dict:
    if agg not in AGGS:
        raise ValueError(f"agg must be one of {sorted(AGGS)}")
    df = ds.table(table).df
    _check(df, metric, group_by)
    df = _apply_filters(df, filters)
    if agg not in {"count", "nunique"}:
        df = df.assign(**{metric: pd.to_numeric(df[metric], errors="coerce")})
    if group_by:
        g = df.groupby(group_by, dropna=False)[metric]
        res = getattr(g, agg)().reset_index().rename(columns={metric: f"{agg}_{metric}"})
        res = res.sort_values(f"{agg}_{metric}", ascending=(sort == "asc"))
        if top_n:
            res = res.head(int(top_n))
        return {"rows": _records(res), "row_count": int(len(res)), "metric": metric, "agg": agg, "group_by": group_by, "filtered_rows": int(len(df))}
    val = getattr(df[metric], agg)()
    return {"value": None if pd.isna(val) else (val.item() if hasattr(val, "item") else val), "metric": metric, "agg": agg, "filtered_rows": int(len(df))}


def trend(
    ds: Dataset,
    table: str,
    date_column: str,
    metric: str,
    agg: str = "sum",
    freq: str = "M",
    group_by: str | None = None,
    filters: list[dict] | None = None,
) -> dict:
    if freq not in FREQS:
        raise ValueError(f"freq must be one of {sorted(FREQS)}")
    if agg not in AGGS:
        raise ValueError(f"agg must be one of {sorted(AGGS)}")
    df = ds.table(table).df
    _check(df, date_column, metric, group_by)
    df = _apply_filters(df, filters)
    dates = pd.to_datetime(df[date_column], errors="coerce")
    df = df.assign(_period=dates.dt.to_period(freq).astype("string"))
    df = df[dates.notna()]
    if agg not in {"count", "nunique"}:
        df = df.assign(**{metric: pd.to_numeric(df[metric], errors="coerce")})
    keys = ["_period"] + ([group_by] if group_by else [])
    res = getattr(df.groupby(keys)[metric], agg)().reset_index().rename(columns={"_period": "period", metric: f"{agg}_{metric}"})
    res = res.sort_values(["period"] + ([group_by] if group_by else []))
    return {"rows": _records(res, 400), "row_count": int(len(res)), "metric": metric, "agg": agg, "freq": freq, "group_by": group_by}


def distribution(ds: Dataset, table: str, column: str, top_n: int = 10, filters: list[dict] | None = None) -> dict:
    df = ds.table(table).df
    _check(df, column)
    df = _apply_filters(df, filters)
    vc = df[column].astype("string").value_counts(dropna=False).head(int(top_n))
    total = int(len(df))
    rows = [{"value": str(k), "count": int(v), "share": round(int(v) / total, 4) if total else None} for k, v in vc.items()]
    return {"rows": rows, "total": total, "column": column}


def compare(ds: Dataset, table: str, metric: str, dimension: str, a: Any, b: Any, agg: str = "sum", filters: list[dict] | None = None) -> dict:
    ra = aggregate(ds, table, metric, agg, filters=(filters or []) + [{"column": dimension, "op": "eq", "value": a}])
    rb = aggregate(ds, table, metric, agg, filters=(filters or []) + [{"column": dimension, "op": "eq", "value": b}])
    va, vb = ra.get("value"), rb.get("value")
    delta = None if va is None or vb is None else vb - va
    pct = None if not va or delta is None else round(delta / va * 100, 2)
    return {"metric": metric, "agg": agg, "dimension": dimension, "a": {"value": a, "result": va}, "b": {"value": b, "result": vb}, "delta": delta, "delta_pct": pct}


def sample_rows(ds: Dataset, table: str, n: int = 5, filters: list[dict] | None = None) -> dict:
    df = _apply_filters(ds.table(table).df, filters)
    return {"rows": _records(df, min(int(n), 20)), "total": int(len(df))}


def search_text(ds: Dataset, query: str, limit: int = 5) -> dict:
    q = query.lower()
    hits = [c for c in ds.text if q in c.lower()]
    return {"hits": [h[:800] for h in hits[:limit]], "total": len(hits)}


TOOLS: dict[str, Any] = {
    "list_tables": list_tables,
    "describe_table": describe_table,
    "aggregate": aggregate,
    "trend": trend,
    "distribution": distribution,
    "compare": compare,
    "sample_rows": sample_rows,
    "search_text": search_text,
}

# JSON schemas in OpenAI function-calling format.
_filters_schema = {
    "type": "array",
    "description": "Row filters applied before aggregation",
    "items": {
        "type": "object",
        "properties": {
            "column": {"type": "string"},
            "op": {"type": "string", "enum": ["eq", "ne", "in", "gt", "gte", "lt", "lte", "contains"]},
            "value": {},
        },
        "required": ["column", "value"],
    },
}
TOOL_SCHEMAS: list[dict] = [
    {"name": "list_tables", "description": "List the tables in the dataset with columns and row counts.", "parameters": {"type": "object", "properties": {}}},
    {"name": "describe_table", "description": "Column kinds, null counts, ranges and top categories for one table.", "parameters": {"type": "object", "properties": {"table": {"type": "string"}}, "required": ["table"]}},
    {
        "name": "aggregate",
        "description": "Aggregate a numeric metric, optionally grouped by one column. Returns exact computed values.",
        "parameters": {
            "type": "object",
            "properties": {
                "table": {"type": "string"},
                "metric": {"type": "string"},
                "agg": {"type": "string", "enum": sorted(AGGS)},
                "group_by": {"type": "string"},
                "filters": _filters_schema,
                "top_n": {"type": "integer"},
                "sort": {"type": "string", "enum": ["asc", "desc"]},
            },
            "required": ["table", "metric"],
        },
    },
    {
        "name": "trend",
        "description": "Aggregate a metric per period (D, W, M, Q, Y) using a date column, optionally split by one dimension.",
        "parameters": {
            "type": "object",
            "properties": {
                "table": {"type": "string"},
                "date_column": {"type": "string"},
                "metric": {"type": "string"},
                "agg": {"type": "string", "enum": sorted(AGGS)},
                "freq": {"type": "string", "enum": sorted(FREQS)},
                "group_by": {"type": "string"},
                "filters": _filters_schema,
            },
            "required": ["table", "date_column", "metric"],
        },
    },
    {"name": "distribution", "description": "Value counts and shares for one column.", "parameters": {"type": "object", "properties": {"table": {"type": "string"}, "column": {"type": "string"}, "top_n": {"type": "integer"}, "filters": _filters_schema}, "required": ["table", "column"]}},
    {"name": "compare", "description": "Compare an aggregated metric between two values of a dimension (e.g. two months, two contractors).", "parameters": {"type": "object", "properties": {"table": {"type": "string"}, "metric": {"type": "string"}, "dimension": {"type": "string"}, "a": {}, "b": {}, "agg": {"type": "string", "enum": sorted(AGGS)}, "filters": _filters_schema}, "required": ["table", "metric", "dimension", "a", "b"]}},
    {"name": "sample_rows", "description": "A few raw rows (only available when the operator allows raw rows to leave the server).", "parameters": {"type": "object", "properties": {"table": {"type": "string"}, "n": {"type": "integer"}, "filters": _filters_schema}, "required": ["table"]}},
    {"name": "search_text", "description": "Search extracted document text (PDF, DOCX) for a phrase.", "parameters": {"type": "object", "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}}, "required": ["query"]}},
]


def run_tool(ds: Dataset, name: str, args: dict, allow_rows: bool = False) -> dict:
    if name not in TOOLS:
        raise ValueError(f"unknown tool '{name}'")
    if name == "sample_rows" and not allow_rows:
        raise PermissionError("raw rows are not sent to the model (EXECFLOW_SEND_ROWS=false)")
    result = TOOLS[name](ds, **args)
    result["evidence_id"] = evidence_id(name, args)
    return result
