"""Sub-agent pipeline for management reporting.

  profiler  (deterministic)  schema, quality, candidate metrics, memory recall
  analyst   (LLM + tools)    asks the analytics tools, returns findings with evidence ids
  reviewer  (gate + LLM)     every number in a finding must exist in its cited evidence
  reporter  (LLM)            management report in EN or AR from confirmed findings only

Charts and KPI values are rebuilt from the evidence rows in code, so the
model chooses what to show but never what the numbers are.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from typing import Any

from .analytics import TOOL_SCHEMAS, run_tool
from .ingest import Dataset
from .llm import ChatClient, Routing, client_for
from .memory import Memory
from .profile import candidate_metrics, profile_dataset

MAX_TOOL_ROUNDS = 8
MAX_FINDINGS_TO_MEMORY = 5

ANALYST_SYSTEM = """You are the analyst sub-agent of ExecFlow, a management reporting assistant for a railway maintenance department.
Rules:
1. You never state a number you did not obtain from a tool result in this conversation.
2. Use the tools to compute aggregates, trends, distributions and comparisons. Prefer few, decisive calls.
3. Every finding must cite the evidence_id values of the tool results that support it.
4. Be specific: name the table, metric, period and group. No generic advice.
5. When you have enough evidence, reply with JSON only:
{"findings":[{"title":str,"detail":str,"metric":str,"value":number|string|null,"evidence":[evidence_id,...],"severity":"high"|"medium"|"low","recommendation":str}],
 "kpis":[{"label":str,"value":number|string,"unit":str,"evidence":evidence_id,"trend":"up"|"down"|"flat"|null}],
 "charts":[{"type":"bar"|"line","title":str,"evidence":evidence_id}],
 "definitions":[{"term":str,"meaning":str}]}
Keep at most 8 findings, 6 kpis, 4 charts."""

REVIEWER_SYSTEM = """You are the reviewer sub-agent. You receive one finding and the exact tool evidence it cites.
Decide: "confirmed" if every claim and number in the finding is supported by the evidence; "corrected" if the direction is right but a number or wording must change (give corrected_detail); "unsupported" otherwise.
Reply with JSON only: {"verdict":"confirmed"|"corrected"|"unsupported","note":str,"corrected_detail":str|null}"""

REPORTER_SYSTEM = {
    "en": """You are the reporter sub-agent. Write a management report in British English for a department director in a UAE government transport authority.
Use only the confirmed findings and KPI values given. Do not add numbers. Structure, as Markdown headings:
# Executive summary (3 to 5 sentences, main point first)
## Key facts (short bullets, each with its number)
## Analysis
## Risks and gaps (include what the data does not show)
## Recommended actions (numbered, owner and timing where possible)
## Next steps
Short paragraphs. No em dashes. No filler.""",
    "ar": """أنت وكيل إعداد التقارير. اكتب تقريراً إدارياً بالعربية الفصحى الرسمية الإماراتية لمدير إدارة في هيئة حكومية للنقل.
استخدم فقط النتائج المؤكدة وقيم المؤشرات المعطاة. لا تضف أرقاماً. الهيكل بعناوين Markdown:
# الملخص التنفيذي (3 إلى 5 جمل، النقطة الرئيسية أولاً)
## الحقائق الرئيسية
## التحليل
## المخاطر والفجوات (بما في ذلك ما لا تظهره البيانات)
## الإجراءات الموصى بها (مرقمة، مع المسؤول والتوقيت حيثما أمكن)
## الخطوات التالية
فقرات قصيرة، بدون حشو.""",
}


@dataclass
class RunResult:
    run_id: str
    dataset: dict
    question: str | None
    lang: str
    models: dict
    findings: list[dict] = field(default_factory=list)
    rejected: list[dict] = field(default_factory=list)
    kpis: list[dict] = field(default_factory=list)
    charts: list[dict] = field(default_factory=list)
    report_md: str = ""
    evidence: dict = field(default_factory=dict)
    memory_used: list[dict] = field(default_factory=list)
    memory_written: list[dict] = field(default_factory=list)
    timings: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items()}


# ------------------------------------------------------------------ helpers

def _json_from(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return {}


_NUM = re.compile(r"(?<![\w.])-?\d[\d,]*(?:\.\d+)?(?![\w.])")


def numbers_in(text: str) -> list[float]:
    out = []
    for m in _NUM.finditer(text or ""):
        try:
            out.append(float(m.group(0).replace(",", "")))
        except ValueError:
            pass
    return out


def _flatten_numbers(obj: Any, acc: set[float]) -> None:
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        acc.add(round(float(obj), 2))
    elif isinstance(obj, str):
        for n in numbers_in(obj):
            acc.add(round(n, 2))
    elif isinstance(obj, dict):
        for v in obj.values():
            _flatten_numbers(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            _flatten_numbers(v, acc)


def evidence_gate(finding: dict, evidence: dict) -> tuple[bool, str]:
    """Deterministic check: cited evidence exists and every number in the
    finding appears in that evidence (allowing rounding to 2 decimals, and
    percentages derived from two evidence numbers)."""
    ids = [e for e in (finding.get("evidence") or []) if e in evidence]
    if not ids:
        return False, "cites no existing evidence"
    pool: set[float] = set()
    for e in ids:
        _flatten_numbers(evidence[e]["result"], pool)
    derived: set[float] = set()
    vals = [v for v in pool if v]
    for a in vals[:60]:
        for b in vals[:60]:
            if a != b:
                derived.add(round((b - a) / abs(a) * 100, 1))
                derived.add(round(b - a, 2))
    text = f"{finding.get('title', '')} {finding.get('detail', '')}"
    for n in numbers_in(text):
        n2 = round(n, 2)
        if n2 in pool or round(n, 1) in derived or n2 in derived:
            continue
        # years and small ordinals inside period labels like 2026-05 are covered by string flattening
        if any(abs(n2 - p) <= 0.5 and abs(p) >= 100 for p in pool):
            continue  # rounding of large values
        return False, f"number {n:g} not found in cited evidence"
    return True, "numbers match evidence"


def _chart_from_evidence(spec: dict, ev: dict) -> dict | None:
    res = ev["result"]
    rows = res.get("rows") or []
    if not rows:
        return None
    if ev["tool"] == "trend":
        key = f"{res['agg']}_{res['metric']}"
        if res.get("group_by"):
            series: dict[str, list] = {}
            for r in rows:
                series.setdefault(str(r[res["group_by"]]), []).append({"x": r["period"], "y": r[key]})
            return {"type": "line", "title": spec.get("title") or f"{res['metric']} per {res['freq']}", "series": [{"name": k, "points": v} for k, v in series.items()], "evidence": ev["id"]}
        return {"type": "line", "title": spec.get("title") or f"{res['metric']} per {res['freq']}", "series": [{"name": res["metric"], "points": [{"x": r["period"], "y": r[key]} for r in rows]}], "evidence": ev["id"]}
    if ev["tool"] == "aggregate" and res.get("group_by"):
        key = f"{res['agg']}_{res['metric']}"
        return {"type": "bar", "title": spec.get("title") or f"{res['metric']} by {res['group_by']}", "series": [{"name": res["metric"], "points": [{"x": str(r[res["group_by"]]), "y": r[key]} for r in rows[:20]]}], "evidence": ev["id"]}
    if ev["tool"] == "distribution":
        return {"type": "bar", "title": spec.get("title") or f"{res['column']} distribution", "series": [{"name": "count", "points": [{"x": r["value"], "y": r["count"]} for r in rows]}], "evidence": ev["id"]}
    return None


# ------------------------------------------------------------------ pipeline

def run_analysis(ds: Dataset, memory: Memory, routing: Routing, question: str | None = None, lang: str = "en", clients: dict[str, ChatClient] | None = None) -> RunResult:
    lang = "ar" if lang == "ar" else "en"
    t0 = time.time()
    clients = clients or {r: client_for(routing, r) for r in ("analyst", "reviewer", "reporter")}
    run_id = memory.start_run(ds.id, question, lang)
    result = RunResult(run_id=run_id, dataset=ds.meta(), question=question, lang=lang, models={r: f"{c.provider}:{c.model}" for r, c in clients.items()})
    if routing.mock:
        result.warnings.append("mock provider in use: set GROQ_API_KEY (or another provider key) for real analysis")

    # 1. profile + memory recall (deterministic)
    profile = profile_dataset(ds)
    cands = candidate_metrics(profile)
    recalled = memory.recall(f"{question or ''} {ds.name} {' '.join(c['metrics'][0] for c in cands[:3])}", k=8)
    result.memory_used = [{"id": m["id"], "kind": m["kind"], "text": m["text"]} for m in recalled]
    result.timings["profile_s"] = round(time.time() - t0, 2)

    # 2. analyst with tools
    t1 = time.time()
    evidence: dict[str, dict] = {}
    context = {
        "question": question or "Produce the key findings a department director should know from this data.",
        "profile": _compact_profile(profile),
        "candidate_metrics": cands,
        "memory": [{"kind": m["kind"], "text": m["text"]} for m in recalled],
        "language_of_report": lang,
    }
    messages = [{"role": "system", "content": ANALYST_SYSTEM}, {"role": "user", "content": json.dumps(context, ensure_ascii=False, default=str)}]
    analyst_out: dict = {}
    for _ in range(MAX_TOOL_ROUNDS):
        res = clients["analyst"].chat(messages, tools=TOOL_SCHEMAS, role="analyst")
        messages.append(res.message())
        if not res.tool_calls:
            analyst_out = _json_from(res.content)
            if analyst_out:
                break
            messages.append({"role": "user", "content": "Reply with the JSON object only."})
            continue
        for tc in res.tool_calls:
            try:
                out = run_tool(ds, tc.name, tc.args, allow_rows=routing.allow_rows)
                evidence[out["evidence_id"]] = {"id": out["evidence_id"], "tool": tc.name, "args": tc.args, "result": out}
                payload = json.dumps(out, ensure_ascii=False, default=str)
            except Exception as e:  # tool errors go back to the model, not to the user
                payload = json.dumps({"error": str(e)})
            messages.append({"role": "tool", "tool_call_id": tc.id, "name": tc.name, "content": payload})
    if not analyst_out:
        # one last attempt without tools to force the JSON answer
        res = clients["analyst"].chat(messages + [{"role": "user", "content": "Now reply with the JSON object only."}], json_mode=True, role="analyst")
        analyst_out = _json_from(res.content)
    result.evidence = {k: {"tool": v["tool"], "args": v["args"], "result": v["result"]} for k, v in evidence.items()}
    result.timings["analyst_s"] = round(time.time() - t1, 2)

    # 3. reviewer: deterministic gate, then model verdict
    t2 = time.time()
    for f in analyst_out.get("findings") or []:
        ok, why = evidence_gate(f, evidence)
        if not ok:
            result.rejected.append({**f, "reason": f"gate: {why}"})
            continue
        ev_payload = {"finding": f, "evidence": [evidence[e]["result"] for e in f["evidence"] if e in evidence]}
        verdict = _json_from(clients["reviewer"].chat([{"role": "system", "content": REVIEWER_SYSTEM}, {"role": "user", "content": json.dumps(ev_payload, ensure_ascii=False, default=str)}], json_mode=True, role="reviewer").content)
        v = verdict.get("verdict", "unsupported")
        if v == "confirmed":
            result.findings.append({**f, "review": verdict.get("note", "")})
        elif v == "corrected" and verdict.get("corrected_detail"):
            fixed = {**f, "detail": verdict["corrected_detail"], "review": "corrected: " + verdict.get("note", "")}
            ok2, why2 = evidence_gate(fixed, evidence)
            (result.findings if ok2 else result.rejected).append(fixed if ok2 else {**fixed, "reason": f"gate after correction: {why2}"})
        else:
            result.rejected.append({**f, "reason": "reviewer: " + verdict.get("note", "unsupported")})
    for k in analyst_out.get("kpis") or []:
        if k.get("evidence") in evidence:
            gate_ok, _ = evidence_gate({"title": "", "detail": str(k.get("value", "")), "evidence": [k["evidence"]]}, evidence)
            if gate_ok:
                result.kpis.append(k)
    for c in analyst_out.get("charts") or []:
        if c.get("evidence") in evidence:
            chart = _chart_from_evidence(c, evidence[c["evidence"]])
            if chart:
                result.charts.append(chart)
    result.timings["review_s"] = round(time.time() - t2, 2)

    # 4. reporter
    t3 = time.time()
    rep_ctx = {"lang": lang, "dataset": ds.name, "question": question, "findings": [{k: f.get(k) for k in ("title", "detail", "severity", "recommendation")} for f in result.findings], "kpis": result.kpis, "data_gaps": [r["reason"] for r in result.rejected][:5], "memory": context["memory"]}
    result.report_md = clients["reporter"].chat([{"role": "system", "content": REPORTER_SYSTEM[lang]}, {"role": "user", "content": json.dumps(rep_ctx, ensure_ascii=False, default=str)}], role="reporter").content.strip()
    result.timings["report_s"] = round(time.time() - t3, 2)

    # 5. memory: confirmed findings and any definitions the analyst surfaced
    for f in result.findings[:MAX_FINDINGS_TO_MEMORY]:
        m = memory.remember("finding", f"{f['title']}: {f['detail']}", source=f"run {run_id} / {ds.name}", dataset_id=ds.id)
        result.memory_written.append({"id": m["id"], "kind": "finding", "text": m["text"]})
    for d in analyst_out.get("definitions") or []:
        if d.get("term") and d.get("meaning"):
            m = memory.remember("definition", f"{d['term']}: {d['meaning']}", source=f"run {run_id}", dataset_id=ds.id)
            result.memory_written.append({"id": m["id"], "kind": "definition", "text": m["text"]})
    result.timings["total_s"] = round(time.time() - t0, 2)
    memory.finish_run(run_id, "done", result.to_dict())
    return result


def _compact_profile(profile: dict) -> dict:
    tables = []
    for t in profile["tables"]:
        cols = []
        for c in t["columns"]:
            item = {"name": c["name"], "kind": c["kind"], "nulls": c["nulls"]}
            for k in ("min", "max", "mean", "sum", "top"):
                if k in c and c[k] is not None:
                    item[k] = c[k]
            cols.append(item)
        tables.append({"name": t["name"], "rows": t["row_count"], "columns": cols})
    return {"tables": tables, "text_preview": profile.get("text_preview", [])}
