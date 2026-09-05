"""OpenAI-compatible chat client with tool calling, plus role-based routing.

Providers are plain base URLs, so the same code talks to Groq (hosted
open-weight models), Nous Portal (Hermes 4), OpenRouter, a local Ollama, or
a running Hermes Agent API server. A deterministic mock stands in when no key
is configured, so the pipeline is testable without network access.
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

ROLES = ("orchestrator", "analyst", "reviewer", "reporter")

# name -> (base_url, api key env var or None, default model)
PROVIDERS: dict[str, tuple[str | None, str | None, str]] = {
    "groq": ("https://api.groq.com/openai/v1", "GROQ_API_KEY", "openai/gpt-oss-120b"),
    "nous": ("https://inference-api.nousresearch.com/v1", "NOUS_API_KEY", "Hermes-4-70B"),
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", "nousresearch/hermes-4-70b"),
    "ollama": ("http://127.0.0.1:11434/v1", None, "hermes3"),
    "hermes": ("http://127.0.0.1:8642/v1", "API_SERVER_KEY", "hermes-agent"),
    "mock": (None, None, "mock"),
}


@dataclass
class ToolCall:
    id: str
    name: str
    args: dict


@dataclass
class ChatResult:
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: dict = field(default_factory=dict)
    model: str = ""
    provider: str = ""

    def message(self) -> dict:
        m: dict = {"role": "assistant", "content": self.content or ""}
        if self.tool_calls:
            m["tool_calls"] = [
                {"id": t.id, "type": "function", "function": {"name": t.name, "arguments": json.dumps(t.args, ensure_ascii=False)}}
                for t in self.tool_calls
            ]
        return m


@dataclass
class ModelRef:
    provider: str
    model: str

    @classmethod
    def parse(cls, spec: str, default_provider: str) -> "ModelRef":
        if ":" in spec:
            p, m = spec.split(":", 1)
            return cls(p.strip(), m.strip())
        return cls(default_provider, spec.strip())

    def __str__(self) -> str:
        return f"{self.provider}:{self.model}"


class ChatClient:
    def __init__(self, provider: str, model: str, base_url: str | None = None, api_key: str | None = None, timeout: float = 120.0):
        if provider not in PROVIDERS:
            raise ValueError(f"unknown provider '{provider}'; known: {sorted(PROVIDERS)}")
        default_url, key_env, _ = PROVIDERS[provider]
        self.provider = provider
        self.model = model
        self.base_url = (base_url or os.environ.get(f"{provider.upper()}_BASE_URL") or default_url or "").rstrip("/")
        self.api_key = api_key or (os.environ.get(key_env) if key_env else None) or "none"
        self.timeout = timeout

    def chat(self, messages: list[dict], tools: list[dict] | None = None, json_mode: bool = False, temperature: float = 0.2, max_tokens: int = 4000, role: str = "") -> ChatResult:
        body: dict[str, Any] = {"model": self.model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
        if tools:
            body["tools"] = [{"type": "function", "function": t} for t in tools]
            body["tool_choice"] = "auto"
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        last_err: Exception | None = None
        for attempt in range(3):
            try:
                with httpx.Client(timeout=self.timeout) as c:
                    r = c.post(f"{self.base_url}/chat/completions", headers=headers, json=body)
                if r.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                r.raise_for_status()
                return self._parse(r.json())
            except httpx.HTTPError as e:  # network or 4xx/5xx after retries
                last_err = e
                if attempt == 2:
                    break
                time.sleep(1.0)
        raise RuntimeError(f"{self.provider}:{self.model} request failed: {last_err}")

    def _parse(self, data: dict) -> ChatResult:
        choice = data["choices"][0]["message"]
        calls = []
        for tc in choice.get("tool_calls") or []:
            fn = tc.get("function", {})
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            calls.append(ToolCall(tc.get("id") or f"call_{len(calls)}", fn.get("name", ""), args))
        return ChatResult(content=choice.get("content") or "", tool_calls=calls, usage=data.get("usage") or {}, model=data.get("model", self.model), provider=self.provider)


# ------------------------------------------------------------------ mock

class MockClient(ChatClient):
    """Deterministic stand-in. Reads the tool results already in the
    conversation and behaves like a careful analyst, reviewer or reporter."""

    def __init__(self, role: str = ""):
        self.provider, self.model, self.base_url, self.api_key, self.timeout = "mock", "mock", "", "none", 0
        self.role = role

    def chat(self, messages, tools=None, json_mode=False, temperature=0.2, max_tokens=4000, role="") -> ChatResult:
        role = role or self.role
        tool_msgs = [m for m in messages if m.get("role") == "tool"]
        user = next((m["content"] for m in messages if m.get("role") == "user"), "")
        if role == "analyst":
            return self._analyst(user, tool_msgs, tools)
        if role == "reviewer":
            return self._reviewer(user)
        if role == "reporter":
            return self._reporter(user)
        return ChatResult(content=json.dumps({"answer": "mock"}), model="mock", provider="mock")

    def _analyst(self, user: str, tool_msgs: list[dict], tools):
        ctx = _json_in(user)
        cands = ctx.get("candidate_metrics") or []
        if not tool_msgs and tools and cands:
            c = cands[0]
            calls = [ToolCall("c1", "describe_table", {"table": c["table"]})]
            if c["dimensions"]:
                calls.append(ToolCall("c2", "aggregate", {"table": c["table"], "metric": c["metrics"][0], "agg": "sum", "group_by": c["dimensions"][0]}))
            if c["date_columns"]:
                calls.append(ToolCall("c3", "trend", {"table": c["table"], "date_column": c["date_columns"][0], "metric": c["metrics"][0], "agg": "sum", "freq": "M"}))
            return ChatResult(content="", tool_calls=calls, model="mock", provider="mock")
        findings, kpis, charts = [], [], []
        for m in tool_msgs:
            try:
                res = json.loads(m["content"])
            except json.JSONDecodeError:
                continue
            ev = res.get("evidence_id")
            rows = res.get("rows") or []
            if "group_by" in res and rows and "period" not in rows[0]:
                key = f"{res['agg']}_{res['metric']}"
                top = rows[0]
                findings.append({
                    "title": f"{top[res['group_by']]} has the highest {res['metric']}",
                    "detail": f"{res['agg']} of {res['metric']} for {top[res['group_by']]} is {top[key]}, the highest across {len(rows)} groups.",
                    "metric": res["metric"], "value": top[key], "evidence": [ev], "severity": "medium",
                    "recommendation": f"Review the drivers behind {res['metric']} for {top[res['group_by']]}.",
                })
                charts.append({"type": "bar", "title": f"{res['metric']} by {res['group_by']}", "evidence": ev})
                kpis.append({"label": f"Top {res['group_by']}", "value": str(top[res["group_by"]]), "unit": "", "evidence": ev, "trend": None})
            elif rows and "period" in rows[0]:
                key = f"{res['agg']}_{res['metric']}"
                first, last = rows[0], rows[-1]
                direction = "up" if last[key] > first[key] else "down" if last[key] < first[key] else "flat"
                findings.append({
                    "title": f"{res['metric']} moved {direction} from {first['period']} to {last['period']}",
                    "detail": f"{res['metric']} was {first[key]} in {first['period']} and {last[key]} in {last['period']}.",
                    "metric": res["metric"], "value": last[key], "evidence": [ev], "severity": "low",
                    "recommendation": "Confirm the trend against the next reporting period before acting.",
                })
                charts.append({"type": "line", "title": f"{res['metric']} per {res.get('freq', 'M')}", "evidence": ev})
                kpis.append({"label": f"{res['metric']} ({last['period']})", "value": last[key], "unit": "", "evidence": ev, "trend": direction})
        findings.append({"title": "Fabricated check", "detail": "Total delay minutes were 9999.", "metric": "x", "value": 9999, "evidence": ["nope"], "severity": "high", "recommendation": ""})
        return ChatResult(content=json.dumps({"findings": findings, "kpis": kpis, "charts": charts}), model="mock", provider="mock")

    def _reviewer(self, user: str):
        ctx = _json_in(user)
        return ChatResult(content=json.dumps({"verdict": "confirmed" if ctx.get("evidence") else "unsupported", "note": "mock review"}), model="mock", provider="mock")

    def _reporter(self, user: str):
        ctx = _json_in(user)
        lang = ctx.get("lang", "en")
        fs = ctx.get("findings") or []
        head = "# الملخص التنفيذي" if lang == "ar" else "# Executive summary"
        body = "\n".join(f"- {f['title']}: {f['detail']}" for f in fs) or "- No confirmed findings."
        return ChatResult(content=f"{head}\n{body}\n\n## Recommended actions\n" + "\n".join(f"- {f.get('recommendation') or 'n/a'}" for f in fs), model="mock", provider="mock")


def _json_in(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}


# ------------------------------------------------------------------ routing

@dataclass
class Routing:
    default_provider: str
    roles: dict[str, ModelRef]
    allow_rows: bool
    mock: bool

    def describe(self) -> dict:
        return {
            "default_provider": self.default_provider,
            "roles": {r: str(m) for r, m in self.roles.items()},
            "allow_rows": self.allow_rows,
            "mock": self.mock,
            "providers_with_keys": [p for p, (_, env, _) in PROVIDERS.items() if env and os.environ.get(env)],
        }


def load_routing(env: dict | None = None) -> Routing:
    e = env if env is not None else os.environ
    provider = (e.get("EXECFLOW_PROVIDER") or "groq").strip().lower()
    key_env = PROVIDERS.get(provider, (None, None, ""))[1]
    mock = provider == "mock" or (key_env is not None and not e.get(key_env))
    if mock:
        provider = "mock"
    roles: dict[str, ModelRef] = {}
    for r in ROLES:
        spec = e.get(f"EXECFLOW_MODEL_{r.upper()}")
        roles[r] = ModelRef.parse(spec, provider) if spec and not mock else ModelRef(provider, PROVIDERS[provider][2])
    return Routing(default_provider=provider, roles=roles, allow_rows=(e.get("EXECFLOW_SEND_ROWS", "false").lower() in {"1", "true", "yes"}), mock=mock)


def client_for(routing: Routing, role: str) -> ChatClient:
    ref = routing.roles[role]
    if ref.provider == "mock":
        return MockClient(role)
    return ChatClient(ref.provider, ref.model)
