"""Deterministic profiling. This is what the analyst agent is allowed to see
before it asks for aggregates: schema, quality and shape, never raw records."""

from __future__ import annotations

import pandas as pd

from .ingest import Dataset, Table

TOP_N = 6


def column_kind(s: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(s):
        return "boolean"
    if pd.api.types.is_datetime64_any_dtype(s):
        return "date"
    if pd.api.types.is_numeric_dtype(s):
        distinct = s.nunique(dropna=True)
        if distinct == len(s.dropna()) and distinct > 20 and str(s.name).lower().endswith(("id", "no", "number", "ref")):
            return "identifier"
        return "numeric"
    distinct = s.nunique(dropna=True)
    n = max(1, int(s.notna().sum()))
    if distinct <= max(12, 0.2 * n):
        return "category"
    if distinct == n and n > 20:
        return "identifier"
    return "text"


def _py(v):
    if pd.isna(v):
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()[:10]
    if hasattr(v, "item"):
        return v.item()
    return v


def profile_table(t: Table) -> dict:
    cols = []
    for c in t.df.columns:
        s = t.df[c]
        kind = column_kind(s)
        info: dict = {
            "name": str(c),
            "kind": kind,
            "non_null": int(s.notna().sum()),
            "nulls": int(s.isna().sum()),
            "distinct": int(s.nunique(dropna=True)),
        }
        if kind == "numeric":
            num = pd.to_numeric(s, errors="coerce")
            info.update(
                min=_py(num.min()),
                max=_py(num.max()),
                mean=None if num.notna().sum() == 0 else round(float(num.mean()), 4),
                sum=None if num.notna().sum() == 0 else round(float(num.sum()), 4),
            )
        elif kind == "date":
            info.update(min=_py(s.min()), max=_py(s.max()))
        elif kind in {"category", "boolean"}:
            vc = s.astype("string").value_counts(dropna=True).head(TOP_N)
            info["top"] = [{"value": str(k), "count": int(v)} for k, v in vc.items()]
        cols.append(info)
    return {"name": t.name, "row_count": t.row_count, "columns": cols}


def profile_dataset(ds: Dataset) -> dict:
    return {
        "dataset": ds.meta(),
        "tables": [profile_table(t) for t in ds.tables],
        "text_preview": [c[:400] for c in ds.text[:3]],
    }


def candidate_metrics(profile: dict) -> list[dict]:
    """Numeric columns that look like measures, with a date column and a few
    dimensions per table. Gives the analyst a starting point without guessing."""
    out = []
    for t in profile["tables"]:
        numeric = [c["name"] for c in t["columns"] if c["kind"] == "numeric"]
        dates = [c["name"] for c in t["columns"] if c["kind"] == "date"]
        dims = [c["name"] for c in t["columns"] if c["kind"] in {"category", "boolean"}]
        if numeric:
            out.append({"table": t["name"], "metrics": numeric[:8], "date_columns": dates[:3], "dimensions": dims[:6]})
    return out
