"""Fail-closed boundary for the supported offline/local execution modes.

This guards ExecFlow's own model traffic, not the behaviour of another process.
A local Ollama server must separately have cloud features and outbound access
disabled; a loopback address alone does not prove local inference.
"""

from __future__ import annotations

import ipaddress
import os
import re
from urllib.parse import urlsplit


class ExecutionPolicyError(ValueError):
    """Unsafe or unsupported model routing; never retry as a provider failure."""


def execution_mode(env=None) -> str:
    env = os.environ if env is None else env
    mode = env.get("EXECFLOW_MODE", "mock").strip().lower()
    if mode not in {"mock", "local"}:
        raise ExecutionPolicyError("EXECFLOW_MODE must be mock or local; cloud execution is disabled")
    return mode


def validate_route(provider: str, model: str, mode: str, base_url: str = "") -> None:
    if mode not in {"mock", "local"}:
        raise ExecutionPolicyError("Unsupported execution mode; cloud execution is disabled")
    if provider == "mock":
        return
    if mode != "local" or provider != "ollama":
        raise ExecutionPolicyError("Execution policy permits only mock, or local Ollama in local mode")
    # Hosted Ollama models are not local merely because their API is on loopback.
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]*(?::[A-Za-z0-9][A-Za-z0-9._-]*)?", model) or "cloud" in model.lower():
        raise ExecutionPolicyError("Local mode requires a local Ollama model name; cloud models are disabled")
    try:
        url = urlsplit(base_url)
        address = ipaddress.ip_address(url.hostname or "")
        valid = (
            url.scheme in {"http", "https"}
            and address.is_loopback
            and (address.version == 4 or address == ipaddress.ip_address("::1"))
            and url.username is None and url.password is None
            and url.port != 0
            and url.path.rstrip("/") == "/v1"
            and "?" not in base_url and "#" not in base_url
            and not any(c.isspace() or ord(c) < 32 for c in base_url)
            and "\\" not in base_url and "%" not in base_url
        )
    except (ValueError, TypeError):
        valid = False
    if not valid:
        raise ExecutionPolicyError("Local Ollama requires a literal loopback HTTP(S) /v1 URL without credentials, query or fragment")
