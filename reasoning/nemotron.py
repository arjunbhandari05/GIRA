"""Nemotron reasoning — single-shot (Round 5) + agentic tool loop (Round 6)."""

from __future__ import annotations

import asyncio
import json
import os
import re
import ssl
import sys
import time
from pathlib import Path
from typing import Any, Callable

import aiohttp
import certifi
import requests
from dotenv import load_dotenv

from reasoning.prompts import build_agentic_system_prompt


def _ssl_context() -> ssl.SSLContext:
    """macOS Python.org installer ships without root CAs; pin certifi's bundle."""
    return ssl.create_default_context(cafile=certifi.where())

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=True)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3-super-120b-a12b:free")
OPENROUTER_AGENT_MODEL = os.getenv("OPENROUTER_AGENT_MODEL", OPENROUTER_MODEL)
ERROR_TEXT = "Reasoning unavailable — set NVIDIA_API_KEY or OPENROUTER_API_KEY in .env"

NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "nemotron-mini")
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "").strip()
NIM_MODEL = os.getenv("NIM_MODEL", "nvidia/nemotron-3-nano-30b-a3b")
NIM_MAX_TOKENS = int(os.getenv("NIM_MAX_TOKENS", "16384"))
NIM_TIMEOUT_SEC = int(os.getenv("NIM_TIMEOUT_SEC", "300"))
NIM_REASONING_BUDGET = int(os.getenv("NIM_REASONING_BUDGET", "16384"))
# auto | nim | openrouter | ollama — when auto, NIM wins if NVIDIA_API_KEY is set
LLM_BACKEND = os.getenv("LLM_BACKEND", "auto").strip().lower()

MAX_ITERATIONS = int(os.getenv("AGENT_MAX_ITERATIONS", "12"))
MAX_CALLS_PER_TOOL = int(os.getenv("AGENT_MAX_CALLS_PER_TOOL", "3"))
LOG_AGENT = os.getenv("AGENT_LOG", "true").strip().lower() in ("1", "true", "yes")


def _log(msg: str) -> None:
    if LOG_AGENT:
        print(msg, file=sys.stderr, flush=True)


def _pgx_synthesis_env_on() -> bool:
    return os.getenv("PGX_SYNTHESIS", "0").strip().lower() in ("1", "true", "yes")


def _default_agent_role(tool: str) -> str:
    """Lightweight multi-agent story for hackathon demos (orchestrator / safety / evidence / writer)."""
    if tool == "check_safety_flags":
        return "safety"
    if tool == "generate_brief":
        return "writer"
    if tool in ("get_snp_profile", "get_patient_intake"):
        return "orchestrator"
    return "evidence"


def _default_trace_reason(tool: str, args_summary: dict[str, Any]) -> str:
    """One-line rationale judges can read in the trace (templated, tool-aware)."""
    if tool == "fetch_pubmed":
        gene = args_summary.get("gene") or "?"
        drug = args_summary.get("drug") or "?"
        return (
            f"Retrieve PubMed evidence for {gene} × {drug} relevant to this patient's PGx context."
        )
    if tool == "fetch_clinvar":
        return "Query ClinVar for clinical significance on prioritized panel rsIDs."
    if tool == "fetch_cpic":
        return "Pull CPIC guideline-backed recommendations for current meds and genotypes."
    if tool == "fetch_pharmgkb":
        return "Annotate panel SNPs with static PharmGKB-style PGx reference rows."
    if tool == "fetch_rxnorm":
        return "Normalize medication strings for interaction and PGx matching."
    if tool == "fetch_trials":
        return "Search recruiting trials for high-impact genes near the patient's zip."
    if tool == "fetch_whoop":
        return "Load recovery / strain context to compare against intake goals."
    if tool == "fetch_glucose":
        return "Load CGM summary to contextualize glycemic control vs PGx risks."
    if tool == "get_snp_profile":
        return "Load the patient's genotype panel — foundation for all PGx tools."
    if tool == "get_patient_intake":
        return "Load structured intake, meds, and visit notes for safety and narrative."
    if tool == "check_safety_flags":
        return "Run mandatory deterministic PGx safety gates before any recommendation."
    if tool == "generate_brief":
        skip = args_summary.get("skip_pgx_synthesis")
        if skip is True:
            return "Assemble the clinician brief (PGx LLM rewrite skipped for speed)."
        return "Assemble the clinician brief; optional Nemotron synthesis rewrites SNP text from evidence."
    return f"Execute {tool} as part of the evidence → safety → brief pipeline."


def _infer_tool_status(tool: str, result: Any) -> tuple[str, str, str | None, bool]:
    """
    Returns (data_source, status, detail, partial) for agent reasoning trail.
    status: ok | error | empty | partial
    """
    partial = False
    if isinstance(result, dict) and result.get("error"):
        return ("tool", "error", str(result["error"])[:500], False)

    if tool in ("fetch_trials", "fetch_pubmed", "fetch_clinvar", "fetch_cpic"):
        if not isinstance(result, dict):
            return ("unknown", "ok", None, False)
        meta = result.get("_meta") or {}
        src = str(meta.get("source") or tool)
        st = str(meta.get("status") or "ok")
        detail = meta.get("detail")
        if isinstance(detail, str):
            detail = detail[:600]
        else:
            detail = None
        if st == "partial":
            partial = True
        return (src, st, detail, partial)

    if tool == "fetch_glucose" and isinstance(result, dict):
        if result.get("error"):
            return ("cgm", "error", str(result["error"])[:300], False)
        return ("cgm_dataset", "ok", None, False)

    if tool == "fetch_whoop" and isinstance(result, dict):
        if result.get("error"):
            return ("whoop", "error", str(result["error"])[:300], False)
        return ("whoop_dataset", "ok", None, False)

    if tool == "get_snp_profile" and isinstance(result, dict):
        if result.get("error"):
            return ("genome", "error", str(result["error"])[:300], False)
        return ("genome_file_or_db", "ok", None, False)

    if isinstance(result, list):
        if not result:
            return ("tool", "empty", "Tool returned an empty list.", False)
        return ("tool", "ok", None, False)

    if isinstance(result, dict):
        return ("tool", "ok", None, False)

    return ("tool", "ok", None, False)


def _trace_step_record(
    tool: str,
    args_summary: dict[str, Any],
    result: Any,
    *,
    deterministic: bool = False,
    auto_invoked: bool = False,
    agent_wide_fallback: bool = False,
    fallback_reason: str | None = None,
    reason: str | None = None,
    agent_role: str | None = None,
    duration_ms: int | None = None,
    step_kind: str = "tool",
) -> dict[str, Any]:
    src, status, detail, partial = _infer_tool_status(tool, result)
    row: dict[str, Any] = {
        "tool": tool,
        "step_kind": step_kind,
        "args_summary": args_summary,
        "result_summary": _summarize_result(tool, result),
        "plan_fallback": deterministic,
        "data_source": src,
        "status": status,
        "partial": partial,
        "reason": reason or _default_trace_reason(tool, args_summary),
        "agent_role": agent_role or _default_agent_role(tool),
    }
    if duration_ms is not None and duration_ms >= 0:
        row["duration_ms"] = duration_ms
    if detail:
        row["detail"] = detail
    if auto_invoked:
        row["auto_invoked"] = True
    if agent_wide_fallback and fallback_reason:
        row["agent_wide_fallback"] = True
        row["detail"] = {
            "no_llm": "No LLM backend reachable — running the full deterministic tool plan.",
            "max_iter": "LLM hit max_iterations — completing remaining tools deterministically.",
            "model_error": "LLM request failed — completing remaining tools deterministically.",
        }.get(
            fallback_reason,
            "Deterministic tool plan used to complete the brief.",
        )
    return row


def _emit_trace_step(
    trace: list[dict[str, Any]],
    step: dict[str, Any],
    on_trace_step: Any | None,
) -> None:
    step["step"] = len(trace) + 1
    trace.append(step)
    if on_trace_step:
        on_trace_step(dict(step))


def _trace_llm_turn_record(
    iteration: int,
    duration_ms: int,
    backend: str,
    *,
    status: str = "ok",
) -> dict[str, Any]:
    return {
        "tool": "nemotron_turn",
        "step_kind": "llm",
        "duration_ms": max(0, duration_ms),
        "args_summary": {"iteration": iteration + 1},
        "result_summary": {"backend": backend, "iteration": iteration + 1},
        "status": status,
        "reason": "Plan next tool call via Nemotron",
        "agent_role": "orchestrator",
    }


def _timed_execute_tool(
    name: str,
    args: dict[str, Any],
    tools_by_name: dict[str, dict[str, Any]],
) -> tuple[Any, int]:
    t0 = time.perf_counter()
    result = _execute_tool(name, args, tools_by_name)
    return result, int((time.perf_counter() - t0) * 1000)


def _compute_timing_summary(trace: list[dict[str, Any]]) -> dict[str, Any]:
    llm_ms = 0
    tool_ms = 0
    by_tool: dict[str, int] = {}
    for step in trace:
        ms = int(step.get("duration_ms") or 0)
        kind = step.get("step_kind") or (
            "llm" if step.get("tool") == "nemotron_turn" else "tool"
        )
        if kind == "llm":
            llm_ms += ms
        else:
            tool_ms += ms
            tool_name = str(step.get("tool") or "unknown")
            by_tool[tool_name] = by_tool.get(tool_name, 0) + ms
    slowest = sorted(by_tool.items(), key=lambda x: x[1], reverse=True)[:6]
    return {
        "total_ms": llm_ms + tool_ms,
        "llm_ms": llm_ms,
        "tool_ms": tool_ms,
        "by_tool_ms": by_tool,
        "slowest_tools": [{"tool": t, "duration_ms": ms} for t, ms in slowest],
        "step_count": len(trace),
    }


async def run_with_tools(
    patient_id: str,
    patient: dict[str, Any],
    tools: list[dict[str, Any]],
    *,
    on_trace_step: Any | None = None,
) -> dict[str, Any]:
    """
    Drive Nemotron through a tool-calling loop. The model emits one of:

      {"tool_call": {"name": "...", "args": {...}}}
      {"done": true}

    per turn. We execute the tool, feed the result back, and continue until
    `generate_brief` returns or MAX_ITERATIONS is hit.

    Returns a dict shaped like the brief itself (see assemble_brief) but
    with an extra `_trace` key — a list of every tool call the model made,
    in order, with timings and a summary of what came back. The trace is
    what the UI surfaces as the "Agent reasoning" panel.

    Backend selection (first reachable wins):
      NVIDIA NIM (NVIDIA_API_KEY) → OpenRouter → Ollama → deterministic fallback.
    """
    from parsers.intake_client import attach_intake_to_patient

    patient = attach_intake_to_patient(patient)
    findings: dict[str, Any] = {
        "patient": patient,
        "get_patient_intake": {
            "patient_id": patient_id,
            "intake": patient.get("intake"),
            "medications_flat": patient.get("current_meds") or [],
        },
    }
    trace: list[dict[str, Any]] = []
    tools_by_name = {t["name"]: t for t in tools}
    descriptions = "\n".join(
        f"- {t['name']}: {t['description']}" for t in tools
    )

    system_prompt = build_agentic_system_prompt(descriptions)
    user_prompt = (
        f"Generate a pharmacogenomic brief for patient {patient_id}.\n"
        f"Zip code: {patient.get('zip_code') or patient.get('zip', 'unknown')}\n\n"
        "PATIENT INTAKE FORM (evaluate goals, side effects, vitals vs PGx/CGM):\n"
        f"{patient.get('intake_text') or 'No intake on file.'}\n\n"
        "Call tools in this order based on what you find:\n"
        "1. get_snp_profile first — always\n"
        "2. get_patient_intake if you need to refresh structured meds/goals (often preloaded)\n"
        "3. fetch_clinvar for patient rsIDs\n"
        "4. fetch_pubmed for gene-drug pairs tied to the patient's genotype\n"
        "5. fetch_whoop and fetch_glucose — compare to intake vitals/goals\n"
        "6. fetch_rxnorm before any medication change recommendation\n"
        "7. fetch_trials if a high-impact variant or safety flag warrants it\n"
        "8. check_safety_flags — mandatory (uses intake medications)\n"
        "9. generate_brief — only after check_safety_flags\n\n"
        "Respond with ONE JSON object per turn:\n"
        '  {"tool_call": {"name": "tool_name", "args": {...}}}\n'
        "When all tools have been called and the brief generated, respond:\n"
        '  {"done": true}\n'
    )

    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    call_counts: dict[str, int] = {}
    safety_checked = False
    backend = _detect_backend()
    _log(f"[nemotron] backend={backend}  patient={patient_id}  tools={len(tools)}")

    if backend == "none":
        _log("[nemotron] no LLM reachable — using deterministic fallback plan")
        return _attach_trace(
            _deterministic_plan(
                patient_id,
                patient,
                tools_by_name,
                findings,
                trace,
                run_reason="no_llm",
                on_trace_step=on_trace_step,
            ),
            trace,
            backend,
        )

    for iteration in range(MAX_ITERATIONS):
        llm_t0 = time.perf_counter()
        try:
            response_text = _call_model(messages, backend, for_agent=True)
        except Exception as exc:
            _log(f"[nemotron] model call failed at iter {iteration + 1}: {exc}")
            return _attach_trace(
                _deterministic_plan(
                    patient_id,
                    patient,
                    tools_by_name,
                    findings,
                    trace,
                    run_reason="model_error",
                    on_trace_step=on_trace_step,
                ),
                trace,
                backend,
                error=str(exc),
            )

        llm_ms = int((time.perf_counter() - llm_t0) * 1000)
        llm_step = _trace_llm_turn_record(iteration, llm_ms, backend)
        _emit_trace_step(trace, llm_step, on_trace_step)
        _log(
            f"[nemotron] iter {iteration + 1} llm={llm_ms}ms: "
            f"{response_text[:160].replace(chr(10), ' ')}..."
        )
        parsed = _safe_json(response_text)

        if parsed is None:
            messages.append({"role": "assistant", "content": response_text})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "Your last response was not a single valid JSON object. "
                        'Respond with exactly one of: {"tool_call": {"name": "...", "args": {...}}} '
                        'or {"done": true}.'
                    ),
                }
            )
            continue

        if parsed.get("done"):
            if not safety_checked:
                _log("[nemotron] tried to finish without safety check — enforcing")
                messages.append({"role": "assistant", "content": response_text})
                messages.append(
                    {
                        "role": "user",
                        "content": "You must call check_safety_flags before finishing.",
                    }
                )
                continue
            if "generate_brief" not in findings:
                _log("[nemotron] done without generate_brief — forcing it")
                forced_args = _enrich_args(
                    "generate_brief", {"all_findings": findings}, findings, patient
                )
                forced, forced_ms = _timed_execute_tool(
                    "generate_brief", forced_args, tools_by_name
                )
                tr = _trace_step_record(
                    "generate_brief",
                    _summarize_args(forced_args),
                    forced,
                    auto_invoked=True,
                    duration_ms=forced_ms,
                )
                _emit_trace_step(trace, tr, on_trace_step)
                findings["generate_brief"] = forced
                return _attach_trace(forced, trace, backend)
            return _attach_trace(findings["generate_brief"], trace, backend)

        call = parsed.get("tool_call") or {}
        name = call.get("name")
        if not name:
            messages.append({"role": "assistant", "content": response_text})
            messages.append(
                {
                    "role": "user",
                    "content": "Missing 'name' in tool_call. Respond with a valid tool_call object.",
                }
            )
            continue

        if name not in tools_by_name:
            messages.append({"role": "assistant", "content": response_text})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        f"Unknown tool '{name}'. Available: "
                        + ", ".join(tools_by_name.keys())
                    ),
                }
            )
            continue

        if name == "generate_brief" and not safety_checked:
            messages.append({"role": "assistant", "content": response_text})
            messages.append(
                {
                    "role": "user",
                    "content": "Policy: call check_safety_flags before generate_brief.",
                }
            )
            continue

        if call_counts.get(name, 0) >= MAX_CALLS_PER_TOOL:
            messages.append({"role": "assistant", "content": response_text})
            messages.append(
                {
                    "role": "user",
                    "content": f"Tool '{name}' already called {MAX_CALLS_PER_TOOL} times — pick a different tool.",
                }
            )
            continue

        args = call.get("args") or {}
        args = _enrich_args(name, args, findings, patient)

        _log(f"[nemotron] tool: {name}  args: {json.dumps(args, default=str)[:140]}")
        result, tool_ms = _timed_execute_tool(name, args, tools_by_name)
        findings[name] = result
        call_counts[name] = call_counts.get(name, 0) + 1
        tr = _trace_step_record(
            name,
            _summarize_args(args),
            result,
            deterministic=False,
            duration_ms=tool_ms,
        )
        _emit_trace_step(trace, tr, on_trace_step)
        _log(f"[nemotron] tool {name} done in {tool_ms}ms")

        if name == "check_safety_flags":
            safety_checked = True

        if name == "generate_brief":
            return _attach_trace(result, trace, backend)

        messages.append({"role": "assistant", "content": response_text})
        messages.append(
            {
                "role": "user",
                "content": (
                    f"Tool {name} returned: "
                    f"{json.dumps(result, default=str)[:600]}\n\n"
                    "What is the next tool call?"
                ),
            }
        )

    _log("[nemotron] max iterations reached — falling back to deterministic plan")
    return _attach_trace(
        _deterministic_plan(
            patient_id,
            patient,
            tools_by_name,
            findings,
            trace,
            run_reason="max_iter",
            on_trace_step=on_trace_step,
        ),
        trace,
        backend,
        error="max_iterations",
    )


# ──────────────────────────────────────────────────────────────────────────────
# Backend selection + transport
# ──────────────────────────────────────────────────────────────────────────────


def _detect_backend() -> str:
    """Return 'nim', 'openrouter', 'ollama', or 'none'."""
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "").strip()

    if LLM_BACKEND == "nim" and NVIDIA_API_KEY:
        return "nim"
    if LLM_BACKEND == "openrouter" and openrouter_key:
        return "openrouter"
    if LLM_BACKEND == "ollama":
        try:
            resp = requests.get(
                f"{OLLAMA_HOST}/api/tags", timeout=2, verify=certifi.where()
            )
            if resp.status_code == 200:
                return "ollama"
        except Exception:
            pass
        return "none"

    # auto (default): NIM first — avoids OpenRouter free-tier 429s when both keys exist
    if NVIDIA_API_KEY:
        return "nim"
    if openrouter_key:
        return "openrouter"
    try:
        resp = requests.get(
            f"{OLLAMA_HOST}/api/tags", timeout=2, verify=certifi.where()
        )
        if resp.status_code == 200:
            return "ollama"
    except Exception:
        pass
    return "none"


def _nim_enable_thinking(*, for_agent: bool = False) -> bool:
    if for_agent:
        raw = os.getenv("NIM_AGENT_ENABLE_THINKING", "false")
    else:
        raw = os.getenv("NIM_ENABLE_THINKING", "true")
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _nim_reasoning_budget(*, for_agent: bool = False) -> int:
    if for_agent:
        return int(os.getenv("NIM_AGENT_REASONING_BUDGET", "4096"))
    return NIM_REASONING_BUDGET


def _nim_max_tokens(*, for_agent: bool = False) -> int:
    if for_agent:
        return int(os.getenv("NIM_AGENT_MAX_TOKENS", str(min(NIM_MAX_TOKENS, 8192))))
    return NIM_MAX_TOKENS


def _nim_is_reasoning_model(*, for_agent: bool = False) -> bool:
    """Thinking/reasoning kwargs (enable_thinking, reasoning_budget) for Nemotron 3 Super / nano."""
    m = NIM_MODEL.lower()
    if _nim_enable_thinking(for_agent=for_agent) and (
        "nemotron-3" in m or "reasoning" in m
    ):
        return True
    return "reasoning" in m


def _prepare_nim_messages(
    messages: list[dict[str, str]], *, for_agent: bool = False
) -> list[dict[str, str]]:
    """Legacy Super models use /think on the system message; nano reasoning uses API kwargs."""
    if _nim_is_reasoning_model(for_agent=for_agent):
        return messages
    if "nemotron-super" not in NIM_MODEL.lower():
        return messages
    out: list[dict[str, str]] = [dict(m) for m in messages]
    if not out or out[0].get("role") != "system":
        return out
    content = str(out[0].get("content") or "")
    if "/think" not in content:
        out[0]["content"] = f"/think\n\n{content}"
    return out


def _extract_chat_content(body: dict) -> str:
    msg = (body.get("choices", [{}])[0].get("message") or {})
    content = (msg.get("content") or "").strip()
    if not content:
        content = (msg.get("reasoning_content") or "").strip()
    if not content:
        content = (msg.get("reasoning") or "").strip()
    return content


def _call_model(
    messages: list[dict[str, str]],
    backend: str,
    *,
    json_mode: bool = True,
    for_agent: bool = False,
) -> str:
    if backend == "openrouter":
        return _call_openrouter(messages, json_mode=json_mode)
    if backend == "nim":
        try:
            return _call_nim(messages, json_mode=json_mode, for_agent=for_agent)
        except RuntimeError as exc:
            if "401" in str(exc) or "403" in str(exc):
                or_key = os.getenv("OPENROUTER_API_KEY", "").strip()
                if or_key and LLM_BACKEND == "auto":
                    _log(f"[nemotron] nim auth failed — falling back to openrouter: {exc}")
                    return _call_openrouter(messages, json_mode=json_mode)
            raise
    if backend == "ollama":
        return _call_ollama(messages, json_mode=json_mode)
    raise RuntimeError("no LLM backend available")


def _call_openrouter(messages: list[dict[str, str]], *, json_mode: bool = True) -> str:
    key = os.getenv("OPENROUTER_API_KEY", "").strip()
    payload: dict[str, Any] = {
        "model": OPENROUTER_AGENT_MODEL,
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": int(os.getenv("FOLLOWUP_MAX_TOKENS", "2048")),
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    response = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/arjunbhandari05/GIRA",
            "X-Title": "GIRA",
        },
        json=payload,
        timeout=120,
        verify=certifi.where(),
    )
    if response.status_code >= 400:
        raise RuntimeError(f"openrouter http {response.status_code}: {response.text[:200]}")
    return _extract_chat_content(response.json())


def _call_ollama(messages: list[dict[str, str]], *, json_mode: bool = True) -> str:
    body: dict[str, Any] = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.1},
    }
    if json_mode:
        body["format"] = "json"
    response = requests.post(
        f"{OLLAMA_HOST}/api/chat",
        json=body,
        timeout=120,
        verify=certifi.where(),
    )
    response.raise_for_status()
    body = response.json()
    return (body.get("message") or {}).get("content") or ""


def _call_nim(
    messages: list[dict[str, str]], *, json_mode: bool = True, for_agent: bool = False
) -> str:
    if not NVIDIA_API_KEY:
        raise RuntimeError("NVIDIA_API_KEY is not set")

    nim_messages = _prepare_nim_messages(messages, for_agent=for_agent)
    use_thinking = _nim_is_reasoning_model(for_agent=for_agent)
    # Reasoning nano models reject response_format; rely on prompt for JSON tool calls.
    effective_json = json_mode and not use_thinking

    payload: dict[str, Any] = {
        "model": NIM_MODEL,
        "messages": nim_messages,
        "temperature": float(os.getenv("NIM_TEMPERATURE", "1")),
        "top_p": float(os.getenv("NIM_TOP_P", "1")),
        "max_tokens": _nim_max_tokens(for_agent=for_agent),
        "stream": False,
    }
    if use_thinking:
        payload["chat_template_kwargs"] = {"enable_thinking": True}
        payload["reasoning_budget"] = _nim_reasoning_budget(for_agent=for_agent)
    if effective_json:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Content-Type": "application/json",
    }

    response = requests.post(
        NIM_URL,
        headers=headers,
        json=payload,
        timeout=NIM_TIMEOUT_SEC,
        verify=certifi.where(),
    )
    if response.status_code >= 400 and effective_json:
        _log(f"[nim] json_mode failed ({response.status_code}), retrying without response_format")
        return _call_nim(messages, json_mode=False, for_agent=for_agent)
    if response.status_code >= 400:
        raise RuntimeError(f"nim http {response.status_code}: {response.text[:300]}")
    return _extract_chat_content(response.json())


def _safe_json(text: str) -> dict | None:
    text = (text or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _execute_tool(
    name: str,
    args: dict,
    tools_by_name: dict[str, dict[str, Any]],
) -> Any:
    tool = tools_by_name.get(name)
    if not tool:
        return {"error": f"Tool {name} not found"}
    fn: Callable = tool["fn"]
    try:
        return fn(args)
    except Exception as exc:
        _log(f"[tool error] {name}: {exc}")
        return {"error": str(exc)}


def _enrich_args(
    name: str,
    args: dict[str, Any],
    findings: dict[str, Any],
    patient: dict[str, Any],
) -> dict[str, Any]:
    """
    Patch in obvious fallbacks the model is allowed to omit. Keeps the
    LLM honest about ordering — these are dependencies, not new data.
    """
    args = dict(args or {})
    snp_profile = findings.get("get_snp_profile") or patient.get("snp_profile") or {}
    current_meds = (
        args.get("current_meds")
        or patient.get("current_meds")
        or patient.get("meds")
        or []
    )

    if name in ("get_snp_profile", "get_patient_intake"):
        args.setdefault("patient_id", patient.get("patient_id"))
    elif name in ("fetch_whoop", "fetch_glucose"):
        args.setdefault("patient_id", patient.get("patient_id"))
    elif name == "fetch_clinvar":
        if not args.get("rsids"):
            args["rsids"] = list(snp_profile.keys())
    elif name == "fetch_pharmgkb":
        args.setdefault("snp_profile", snp_profile)
        if not args.get("genes"):
            args["genes"] = sorted(
                {
                    snp.get("gene")
                    for snp in snp_profile.values()
                    if isinstance(snp, dict) and snp.get("gene")
                }
            )
    elif name == "fetch_cpic":
        args.setdefault("current_meds", current_meds)
        args.setdefault("snp_profile", snp_profile)
    elif name == "fetch_rxnorm":
        args.setdefault("current_meds", current_meds)
        args.setdefault("snp_profile", snp_profile)
    elif name == "fetch_trials":
        args.setdefault(
            "zip_code", patient.get("zip_code") or patient.get("zip", "")
        )
    elif name == "check_safety_flags":
        args.setdefault("snp_profile", snp_profile)
        args.setdefault("current_meds", current_meds)
    elif name == "generate_brief":
        args.setdefault("all_findings", findings)
        if "skip_pgx_synthesis" not in args:
            parallel = os.getenv("AGENT_MODE", "llm").strip().lower() == "parallel"
            args.setdefault(
                "skip_pgx_synthesis",
                parallel and not _pgx_synthesis_env_on(),
            )
    return args


# ──────────────────────────────────────────────────────────────────────────────
# Deterministic fallback — keeps verification useful even with no LLM
# ──────────────────────────────────────────────────────────────────────────────


DETERMINISTIC_PLAN = [
    "get_snp_profile",
    "get_patient_intake",
    "fetch_clinvar",
    "fetch_cpic",
    "fetch_whoop",
    "fetch_glucose",
    "fetch_rxnorm",
    "fetch_pubmed",
    "fetch_trials",
    "check_safety_flags",
    "generate_brief",
]

PUBMED_PAIRS = [
    ("TCF7L2", "metformin"),
    ("SLC22A1", "metformin"),
    ("SLCO1B1", "atorvastatin"),
    ("CYP2C19", "clopidogrel"),
    ("VKORC1", "warfarin"),
    ("FTO", "semaglutide"),
]
PRIMARY_GENES = [
    "TCF7L2",
    "SLC22A1",
    "SLCO1B1",
    "CYP2C19",
    "CYP2C9",
    "VKORC1",
    "FTO",
]
# Safety + metformin + key T2D loci first; full panel used when profile is loaded
PRIMARY_RSIDS = [
    "rs4149056",
    "rs4244285",
    "rs4986893",
    "rs9923231",
    "rs1799853",
    "rs1057910",
    "rs622342",
    "rs7903146",
    "rs2289669",
    "rs11212617",
    "rs9939609",
    "rs429358",
    "rs7412",
]


async def run_parallel_tool_plan(
    patient_id: str,
    patient: dict[str, Any],
    tools: list[dict[str, Any]],
    *,
    on_trace_step: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """
    Run the full brief tool suite with phased parallelism. Each tool emits a
    trace step via on_trace_step as soon as it finishes (completion order in the log).
    """
    from parsers.intake_client import attach_intake_to_patient

    patient = attach_intake_to_patient(patient)
    tools_by_name = {t["name"]: t for t in tools}
    trace: list[dict[str, Any]] = []
    findings: dict[str, Any] = {
        "patient": patient,
        "get_patient_intake": {
            "patient_id": patient_id,
            "intake": patient.get("intake"),
            "medications_flat": patient.get("current_meds") or [],
        },
    }
    loop = asyncio.get_running_loop()

    async def _run_tool(tool_name: str, args: dict[str, Any]) -> tuple[str, dict[str, Any], Any]:
        enriched = _enrich_args(tool_name, dict(args), findings, patient)
        result = await loop.run_in_executor(
            None, _execute_tool, tool_name, enriched, tools_by_name
        )
        return tool_name, enriched, result

    async def _run_traced(
        tool_name: str, args: dict[str, Any]
    ) -> tuple[str, dict[str, Any], Any]:
        t0 = time.perf_counter()
        tool_name, enriched, result = await _run_tool(tool_name, args)
        tool_ms = int((time.perf_counter() - t0) * 1000)
        rec = _trace_step_record(
            tool_name,
            _summarize_args(enriched),
            result,
            deterministic=True,
            duration_ms=tool_ms,
        )
        rec["parallel"] = True
        _emit_trace_step(trace, rec, on_trace_step)
        _log(f"[nemotron] parallel {tool_name} done in {tool_ms}ms")
        return tool_name, enriched, result

    _log(f"[nemotron] parallel plan  patient={patient_id}")

    # Phase 1 — foundation (parallel)
    phase1 = await asyncio.gather(
        _run_traced("get_snp_profile", {"patient_id": patient_id}),
        _run_traced("get_patient_intake", {"patient_id": patient_id}),
    )
    for name, _args, result in phase1:
        findings[name] = result

    snp_profile = findings.get("get_snp_profile") or {}
    panel_rsids = list(snp_profile.keys()) if snp_profile else []
    priority = [r for r in PRIMARY_RSIDS if r in panel_rsids or not panel_rsids]
    rsids = priority + [r for r in panel_rsids if r not in priority]
    zip_code = patient.get("zip_code") or patient.get("zip", "")

    # Phase 2 — evidence + wearables (NCBI tools run sequentially inside fetch_*)
    phase2_specs: list[tuple[str, dict[str, Any]]] = [
        ("fetch_clinvar", {"rsids": rsids}),
        ("fetch_cpic", {}),
        ("fetch_whoop", {"patient_id": patient_id}),
        ("fetch_glucose", {"patient_id": patient_id}),
        ("fetch_rxnorm", {}),
    ]
    for gene, drug in PUBMED_PAIRS:
        phase2_specs.append(("fetch_pubmed", {"gene": gene, "drug": drug}))
    for gene in PRIMARY_GENES:
        phase2_specs.append(
            ("fetch_trials", {"gene": gene, "zip_code": zip_code})
        )

    pubmed_articles: list[dict] = []
    pubmed_meta: dict[str, Any] = {}
    trials_acc: list[dict] = []
    seen_nct: set[str] = set()
    trials_meta: dict[str, Any] = {
        "source": "clinicaltrials.gov",
        "status": "ok",
        "detail": None,
    }

    phase2_tasks = [
        asyncio.create_task(_run_traced(name, args)) for name, args in phase2_specs
    ]
    for finished in asyncio.as_completed(phase2_tasks):
        tool_name, _args, result = await finished
        if tool_name == "fetch_pubmed":
            if isinstance(result, dict):
                pubmed_articles.extend(result.get("articles") or [])
                pubmed_meta = result.get("_meta") or pubmed_meta
            elif isinstance(result, list):
                pubmed_articles.extend(result)
        elif tool_name == "fetch_trials":
            rows: list[dict] = []
            if isinstance(result, dict):
                rows = [t for t in (result.get("trials") or []) if isinstance(t, dict)]
                meta = result.get("_meta") or {}
                if meta.get("status") == "error":
                    trials_meta["status"] = "error"
                    trials_meta["detail"] = meta.get("detail")
                elif meta.get("status") == "empty" and trials_meta.get("status") == "ok":
                    trials_meta.setdefault("_empty_notes", []).append(
                        str(meta.get("detail") or "")
                    )
            elif isinstance(result, list):
                rows = [t for t in result if isinstance(t, dict)]
            for t in rows:
                nid = t.get("nct_id")
                if nid and nid not in seen_nct:
                    seen_nct.add(nid)
                    trials_acc.append(t)
        else:
            findings[tool_name] = result

    findings["fetch_pubmed"] = {"articles": pubmed_articles, "_meta": pubmed_meta}
    if not trials_acc and trials_meta.get("status") == "ok":
        trials_meta["status"] = "empty"
        trials_meta["detail"] = (
            "No recruiting trials from ClinicalTrials.gov matched the "
            "gene + type-2-diabetes filters for the scanned genes."
        )
    findings["fetch_trials"] = {"trials": trials_acc[:8], "_meta": trials_meta}

    # Phase 3 — safety (depends on SNP + meds)
    _name, _args, safety = await _run_traced("check_safety_flags", {})
    findings["check_safety_flags"] = safety

    # Phase 4 — brief assembly (optional Nemotron PGx synthesis when PGX_SYNTHESIS=1)
    skip_syn = not _pgx_synthesis_env_on()
    findings["_fast_brief"] = skip_syn
    assembling = _trace_step_record(
        "generate_brief",
        {"skip_pgx_synthesis": skip_syn},
        {"status": "assembling"},
    )
    assembling["status"] = "partial"
    assembling["parallel"] = True
    _emit_trace_step(trace, assembling, on_trace_step)

    try:
        _name, _args, brief = await asyncio.wait_for(
            _run_traced("generate_brief", {"skip_pgx_synthesis": skip_syn}),
            timeout=float(os.getenv("BRIEF_ASSEMBLY_TIMEOUT_SEC", "45")),
        )
    except asyncio.TimeoutError:
        _log("[nemotron] generate_brief timed out — returning partial brief")
        brief = {
            "error": "Brief assembly timed out",
            "action_required": False,
            "safety_flags": findings.get("check_safety_flags") or [],
            "snp_summary": [],
            "recommendation": {"switch_required": False, "rationale": []},
            "citations": [],
            "patient_summary": "Brief assembly timed out; retry or check server logs.",
        }
        err_rec = _trace_step_record("generate_brief", {}, brief)
        err_rec["status"] = "error"
        _emit_trace_step(trace, err_rec, on_trace_step)

    return _attach_trace(brief, trace, "parallel")


def _deterministic_plan(
    patient_id: str,
    patient: dict[str, Any],
    tools_by_name: dict[str, dict[str, Any]],
    findings: dict[str, Any],
    trace: list[dict[str, Any]] | None = None,
    run_reason: str | None = None,
    *,
    on_trace_step: Any | None = None,
) -> dict[str, Any]:
    snp_profile = patient.get("snp_profile") or {}
    primary_rsids = PRIMARY_RSIDS
    primary_genes = PRIMARY_GENES
    pubmed_pairs = PUBMED_PAIRS

    first_fallback_note = True

    def _note(
        tool_name: str,
        args: dict,
        result: Any,
        *,
        duration_ms: int | None = None,
    ) -> None:
        nonlocal first_fallback_note
        if trace is None:
            return
        aw = bool(run_reason and first_fallback_note)
        fr = run_reason if aw else None
        first_fallback_note = False
        rec = _trace_step_record(
            tool_name,
            _summarize_args(args),
            result,
            deterministic=True,
            agent_wide_fallback=aw,
            fallback_reason=fr,
            duration_ms=duration_ms,
        )
        _emit_trace_step(trace, rec, on_trace_step)

    for tool_name in DETERMINISTIC_PLAN:
        if tool_name == "fetch_pubmed":
            collected: list[dict] = []
            last_meta: dict[str, Any] = {}
            for gene, drug in pubmed_pairs:
                args = {"gene": gene, "drug": drug}
                got, pub_ms = _timed_execute_tool("fetch_pubmed", args, tools_by_name)
                if isinstance(got, dict):
                    collected.extend(got.get("articles") or [])
                    last_meta = got.get("_meta") or last_meta
                elif isinstance(got, list):
                    collected.extend(got)
                _note("fetch_pubmed", args, got, duration_ms=pub_ms)
            findings["fetch_pubmed"] = {"articles": collected, "_meta": last_meta}
            continue

        if tool_name == "fetch_trials":
            trials_acc: list[dict] = []
            seen_nct: set[str] = set()
            merged_meta: dict[str, Any] = {
                "source": "clinicaltrials.gov",
                "status": "ok",
                "detail": None,
            }
            for gene in primary_genes:
                args = {
                    "gene": gene,
                    "zip_code": patient.get("zip_code") or patient.get("zip", ""),
                }
                got, trial_ms = _timed_execute_tool("fetch_trials", args, tools_by_name)
                _note("fetch_trials", args, got, duration_ms=trial_ms)
                rows: list[dict] = []
                if isinstance(got, dict):
                    rows = [t for t in (got.get("trials") or []) if isinstance(t, dict)]
                    meta = got.get("_meta") or {}
                    if meta.get("status") == "error":
                        merged_meta["status"] = "error"
                        merged_meta["detail"] = meta.get("detail")
                    elif meta.get("status") == "empty" and merged_meta.get("status") == "ok":
                        merged_meta.setdefault("_empty_notes", []).append(
                            f"{gene}: {meta.get('detail')}"
                        )
                elif isinstance(got, list):
                    rows = [t for t in got if isinstance(t, dict)]
                for t in rows:
                    nid = t.get("nct_id")
                    if nid and nid not in seen_nct:
                        seen_nct.add(nid)
                        trials_acc.append(t)
            if not trials_acc and merged_meta.get("status") == "ok":
                merged_meta["status"] = "empty"
                merged_meta["detail"] = (
                    "No recruiting trials from ClinicalTrials.gov matched the "
                    "gene + type-2-diabetes filters for the scanned genes."
                )
            findings["fetch_trials"] = {
                "trials": trials_acc[:8],
                "_meta": merged_meta,
            }
            continue

        if tool_name == "fetch_clinvar":
            args = {"rsids": primary_rsids or list(snp_profile.keys())}
        else:
            args = {}

        args = _enrich_args(tool_name, args, findings, patient)
        result, tool_ms = _timed_execute_tool(tool_name, args, tools_by_name)
        findings[tool_name] = result
        _note(tool_name, args, result, duration_ms=tool_ms)
        if tool_name == "generate_brief":
            return result

    return findings.get("generate_brief") or {}


def followup(patient_id: str, messages: list[dict]) -> str:
    """Grounded follow-up Q&A using the persisted patient context file (no tools)."""
    from output.patient_context import build_followup_system_prompt, load_patient_context

    ctx = load_patient_context(patient_id)
    system = build_followup_system_prompt(ctx)
    backend = _detect_backend()
    if backend == "none":
        return ERROR_TEXT

    llm_messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        role = str(msg.get("role") or "user")
        content = str(msg.get("content") or "")
        if content:
            llm_messages.append({"role": role, "content": content})

    try:
        return _call_model(llm_messages, backend, json_mode=False).strip()
    except Exception as exc:
        _log(f"followup error: {exc}")
        return f"Follow-up reasoning failed: {exc}"


# ──────────────────────────────────────────────────────────────────────────────
# Trace helpers
# ──────────────────────────────────────────────────────────────────────────────


def _llm_model_for_backend(backend: str) -> str | None:
    b = (backend or "").strip().lower()
    if b == "nim":
        return NIM_MODEL
    if b == "openrouter":
        return OPENROUTER_AGENT_MODEL
    if b == "ollama":
        return OLLAMA_MODEL
    return None


def _attach_trace(
    brief: dict[str, Any],
    trace: list[dict[str, Any]],
    backend: str,
    error: str | None = None,
) -> dict[str, Any]:
    if not isinstance(brief, dict):
        brief = {"brief": brief}
    brief = dict(brief)
    brief["_trace"] = trace
    brief["_backend"] = backend
    mid = _llm_model_for_backend(backend)
    if mid:
        brief["_llm_model"] = mid
    if error:
        brief["_backend_error"] = error
    if trace:
        brief["_timing"] = _compute_timing_summary(trace)
    return brief


def _summarize_args(args: dict[str, Any]) -> dict[str, Any]:
    """Compact form of the args for the UI — no full SNP dicts, etc."""
    if not isinstance(args, dict):
        return {"value": str(args)[:80]}
    out: dict[str, Any] = {}
    for k, v in args.items():
        if k in ("snp_profile", "all_findings"):
            if isinstance(v, dict):
                out[k] = f"<{len(v)} keys>"
            else:
                out[k] = "<object>"
        elif isinstance(v, list):
            preview = v[:6]
            if len(v) > 6:
                preview = preview + ["…"]
            out[k] = preview
        elif isinstance(v, str):
            out[k] = v if len(v) <= 80 else v[:77] + "…"
        else:
            out[k] = v
    return out


def _summarize_result(name: str, result: Any) -> dict[str, Any]:
    """Tiny summary of what the tool returned, suitable for the UI."""
    if isinstance(result, dict) and result.get("error"):
        return {"error": str(result["error"])[:200]}

    if name == "get_snp_profile" and isinstance(result, dict):
        risk = []
        for rsid, snp in result.items():
            if not isinstance(snp, dict):
                continue
            gene = snp.get("gene")
            geno = snp.get("genotype")
            if geno and geno not in ("--",) and len(geno) == 2:
                risk.append(f"{gene} {geno}")
        return {"snp_count": len(result), "genotypes": risk[:10]}

    if name == "get_patient_intake" and isinstance(result, dict):
        intake = result.get("intake") or {}
        meds = intake.get("medications") or []
        visit = intake.get("visitNotes") or {}
        has_subjective = any(
            str(visit.get(k) or "").strip()
            for k in ("chiefComplaint", "painSymptoms", "sleepEnergy", "moodFeeling")
        )
        return {
            "has_intake": bool(result.get("has_clinical_data")),
            "has_subjective": has_subjective,
            "med_count": len(meds),
            "goals": (intake.get("goals") or [])[:4],
            "side_effects": (intake.get("sideEffects") or [])[:4],
        }

    if name == "fetch_cpic" and isinstance(result, dict):
        recs = result.get("recommendations") or []
        return {
            "recommendations": len(recs),
            "hits": len(recs),
            "drugs": [r.get("drug") for r in recs if isinstance(r, dict) and r.get("drug")][:3],
        }

    if name == "fetch_glucose" and isinstance(result, dict):
        return {
            "tir_pct": result.get("time_in_range_pct"),
            "avg_mgdl": result.get("avg_glucose_mgdl"),
            "gmi_pct": result.get("gmi_pct"),
            "trend": result.get("trend_direction"),
            "hypos": result.get("hypoglycemic_events"),
            "controlled": result.get("controlled"),
        }

    if name == "fetch_whoop" and isinstance(result, dict):
        metrics = result.get("metrics") or {}
        return {
            "hrv_avg": (metrics.get("hrv_ms") or {}).get("avg_30d"),
            "hrv_trend": (metrics.get("hrv_ms") or {}).get("trend"),
            "rhr_avg": (metrics.get("rhr_bpm") or {}).get("avg_30d"),
            "hypoglycemia_signal": result.get("hypoglycemia_signal"),
        }

    if name == "fetch_pharmgkb" and isinstance(result, list):
        return {
            "hits": len(result),
            "genes": [r.get("gene") for r in result if isinstance(r, dict)][:10],
        }

    if name == "fetch_clinvar":
        if isinstance(result, dict) and "variants" in result:
            vars_ = [v for v in (result.get("variants") or []) if isinstance(v, dict)]
            meta = result.get("_meta") or {}
            return {
                "hits": len(vars_),
                "significance": [
                    f"{r.get('rsid')}={r.get('clinical_significance')}"
                    for r in vars_
                ][:6],
                "api_status": meta.get("status"),
            }
        if isinstance(result, list):
            return {
                "hits": len(result),
                "significance": [
                    f"{r.get('rsid')}={r.get('clinical_significance')}"
                    for r in result
                    if isinstance(r, dict)
                ][:6],
            }

    if name == "fetch_pubmed":
        arts: list[Any] = []
        pmeta: dict[str, Any] = {}
        if isinstance(result, dict):
            arts = [a for a in (result.get("articles") or []) if isinstance(a, dict)]
            pmeta = result.get("_meta") or {}
        elif isinstance(result, list):
            arts = [a for a in result if isinstance(a, dict)]
        return {
            "hits": len(arts),
            "pmids": [r.get("pmid") for r in arts][:6],
            "api_status": pmeta.get("status"),
        }

    if name == "fetch_trials":
        rows: list[Any] = []
        tmeta: dict[str, Any] = {}
        if isinstance(result, dict):
            rows = [t for t in (result.get("trials") or []) if isinstance(t, dict)]
            tmeta = result.get("_meta") or {}
        elif isinstance(result, list):
            rows = [t for t in result if isinstance(t, dict)]
        return {
            "matches": len(rows),
            "ncts": [r.get("nct_id") for r in rows if isinstance(r, dict)][:6],
            "api_status": tmeta.get("status"),
        }

    if name == "fetch_rxnorm" and isinstance(result, list):
        return {
            "interactions": len(result),
            "drugs": list(
                {
                    r.get("drug")
                    for r in result
                    if isinstance(r, dict) and r.get("drug")
                }
            )[:6],
        }

    if name == "check_safety_flags" and isinstance(result, list):
        return {
            "flags": [
                {"gene": r.get("gene"), "severity": r.get("severity")}
                for r in result
                if isinstance(r, dict)
            ]
        }

    if name == "generate_brief" and isinstance(result, dict):
        rec = result.get("recommendation") or {}
        return {
            "action_required": result.get("action_required"),
            "discontinue": rec.get("discontinue"),
            "start": rec.get("start"),
            "citations": len(result.get("citations") or []),
        }

    if isinstance(result, list):
        return {"count": len(result)}
    return {"keys": list(result.keys())[:10] if isinstance(result, dict) else []}
