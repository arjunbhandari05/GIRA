"""Nemotron reasoning — single-shot (Round 5) + agentic tool loop (Round 6)."""

from __future__ import annotations

import json
import os
import re
import ssl
import sys
from pathlib import Path
from typing import Any, Callable

import aiohttp
import certifi
import requests
from dotenv import load_dotenv

from reasoning.prompts import build_agentic_system_prompt, build_system_prompt


def _ssl_context() -> ssl.SSLContext:
    """macOS Python.org installer ships without root CAs; pin certifi's bundle."""
    return ssl.create_default_context(cafile=certifi.where())

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=True)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3-super-120b-a12b:free")
OPENROUTER_AGENT_MODEL = os.getenv("OPENROUTER_AGENT_MODEL", OPENROUTER_MODEL)
ERROR_TEXT = "Reasoning unavailable — check OPENROUTER_API_KEY"

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "nemotron-mini")
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "").strip()
NIM_MODEL = os.getenv("NIM_MODEL", "nvidia/nemotron-mini-4b-instruct")

MAX_ITERATIONS = int(os.getenv("AGENT_MAX_ITERATIONS", "12"))
MAX_CALLS_PER_TOOL = int(os.getenv("AGENT_MAX_CALLS_PER_TOOL", "3"))
LOG_AGENT = os.getenv("AGENT_LOG", "true").strip().lower() in ("1", "true", "yes")


def _log(msg: str) -> None:
    if LOG_AGENT:
        print(msg, file=sys.stderr, flush=True)


def _infer_tool_status(tool: str, result: Any) -> tuple[str, str, str | None, bool]:
    """
    Returns (data_source, status, detail, partial) for agent reasoning trail.
    status: ok | error | empty | partial
    """
    partial = False
    if isinstance(result, dict) and result.get("error"):
        return ("tool", "error", str(result["error"])[:500], False)

    if tool in ("fetch_trials", "fetch_pubmed", "fetch_clinvar"):
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
) -> dict[str, Any]:
    src, status, detail, partial = _infer_tool_status(tool, result)
    row: dict[str, Any] = {
        "tool": tool,
        "args_summary": args_summary,
        "result_summary": _summarize_result(tool, result),
        "plan_fallback": deterministic,
        "data_source": src,
        "status": status,
        "partial": partial,
    }
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


# ──────────────────────────────────────────────────────────────────────────────
# Round 5: legacy single-shot prompt path (used by FastAPI /brief)
# ──────────────────────────────────────────────────────────────────────────────


async def run_nemotron(context_prompt: str) -> str:
    key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not key:
        return ERROR_TEXT

    payload = {
        "model": OPENROUTER_MODEL,
        "max_tokens": 1000,
        "messages": [
            {"role": "system", "content": build_system_prompt()},
            {"role": "user", "content": context_prompt},
        ],
    }
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/glycoagent",
        "X-Title": "GlycoAgent",
    }

    try:
        timeout = aiohttp.ClientTimeout(total=120)
        connector = aiohttp.TCPConnector(ssl=_ssl_context())
        async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
            async with session.post(OPENROUTER_URL, headers=headers, json=payload) as resp:
                if resp.status >= 400:
                    body = await resp.text()
                    _log(f"[run_nemotron] HTTP {resp.status}: {body[:200]}")
                    return ERROR_TEXT
                data = await resp.json()

        message = data.get("choices", [{}])[0].get("message", {}) or {}
        content = (message.get("content") or "").strip()
        if not content:
            content = (message.get("reasoning") or "").strip()
        if not content:
            return ERROR_TEXT
        if _looks_like_planning_text(content):
            return _final_brief_draft_from_context(context_prompt) or content
        return content
    except Exception as exc:
        _log(f"[run_nemotron] exception: {exc!r}")
        return ERROR_TEXT


def _looks_like_planning_text(text: str) -> bool:
    lowered = text.lower()
    return any(
        marker in lowered
        for marker in (
            "we need to",
            "we must",
            "let's",
            "first, ensure",
            "the draft's",
            "thus final output",
        )
    )


def _final_brief_draft_from_context(context_prompt: str) -> str:
    marker = "FINAL BRIEF DRAFT (return this kind of content directly, not commentary):"
    if marker not in context_prompt:
        return ""
    draft = context_prompt.split(marker, 1)[1]
    draft = draft.split("Write the brief now.", 1)[0]
    return draft.strip()


# ──────────────────────────────────────────────────────────────────────────────
# Round 6: agentic tool-calling loop
# ──────────────────────────────────────────────────────────────────────────────


async def run_with_tools(
    patient_id: str,
    patient: dict[str, Any],
    tools: list[dict[str, Any]],
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
      OpenRouter (OPENROUTER_API_KEY) → NVIDIA NIM (NVIDIA_API_KEY) →
      Ollama (OLLAMA_HOST reachable) → deterministic fallback.
    """
    findings: dict[str, Any] = {"patient": patient}
    trace: list[dict[str, Any]] = []
    tools_by_name = {t["name"]: t for t in tools}
    descriptions = "\n".join(
        f"- {t['name']}: {t['description']}" for t in tools
    )

    system_prompt = build_agentic_system_prompt(descriptions)
    user_prompt = (
        f"Generate a pharmacogenomic brief for patient {patient_id}.\n"
        f"Current medications: {json.dumps(patient.get('current_meds', []) or patient.get('meds', []))}\n"
        f"Zip code: {patient.get('zip_code') or patient.get('zip', 'unknown')}\n\n"
        "Call tools in this order based on what you find:\n"
        "1. get_snp_profile first — always\n"
        "2. fetch_clinvar for high-risk rsIDs\n"
        "3. fetch_pharmgkb for flagged genes\n"
        "4. fetch_whoop and fetch_glucose together — confirm medication response\n"
        "5. fetch_rxnorm before any medication change recommendation\n"
        "6. fetch_pubmed for every gene-drug claim\n"
        "7. fetch_trials if TCF7L2 TT or FTO AA or APOE4 found\n"
        "8. check_safety_flags — mandatory\n"
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
                patient_id, patient, tools_by_name, findings, trace, run_reason="no_llm"
            ),
            trace,
            backend,
        )

    for iteration in range(MAX_ITERATIONS):
        try:
            response_text = _call_model(messages, backend)
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
                ),
                trace,
                backend,
                error=str(exc),
            )

        _log(f"[nemotron] iter {iteration + 1}: {response_text[:160].replace(chr(10), ' ')}...")
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
                forced = _execute_tool("generate_brief", forced_args, tools_by_name)
                tr = _trace_step_record(
                    "generate_brief",
                    _summarize_args(forced_args),
                    forced,
                    auto_invoked=True,
                )
                tr["step"] = len(trace) + 1
                trace.append(tr)
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
        result = _execute_tool(name, args, tools_by_name)
        findings[name] = result
        call_counts[name] = call_counts.get(name, 0) + 1
        tr = _trace_step_record(name, _summarize_args(args), result, deterministic=False)
        tr["step"] = len(trace) + 1
        trace.append(tr)

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
        ),
        trace,
        backend,
        error="max_iterations",
    )


# ──────────────────────────────────────────────────────────────────────────────
# Backend selection + transport
# ──────────────────────────────────────────────────────────────────────────────


def _detect_backend() -> str:
    """Return 'openrouter', 'nim', 'ollama', or 'none' (first reachable wins)."""
    if os.getenv("OPENROUTER_API_KEY", "").strip():
        return "openrouter"
    if NVIDIA_API_KEY:
        return "nim"
    try:
        resp = requests.get(
            f"{OLLAMA_HOST}/api/tags", timeout=2, verify=certifi.where()
        )
        if resp.status_code == 200:
            return "ollama"
    except Exception:
        pass
    return "none"


def _call_model(messages: list[dict[str, str]], backend: str) -> str:
    if backend == "openrouter":
        return _call_openrouter(messages)
    if backend == "nim":
        return _call_nim(messages)
    if backend == "ollama":
        return _call_ollama(messages)
    raise RuntimeError("no LLM backend available")


def _call_openrouter(messages: list[dict[str, str]]) -> str:
    key = os.getenv("OPENROUTER_API_KEY", "").strip()
    response = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/glycoagent",
            "X-Title": "GlycoAgent",
        },
        json={
            "model": OPENROUTER_AGENT_MODEL,
            "messages": messages,
            "temperature": 0.1,
            "max_tokens": 1024,
            "response_format": {"type": "json_object"},
        },
        timeout=120,
        verify=certifi.where(),
    )
    if response.status_code >= 400:
        raise RuntimeError(f"openrouter http {response.status_code}: {response.text[:200]}")
    body = response.json()
    msg = (body.get("choices", [{}])[0].get("message") or {})
    content = (msg.get("content") or "").strip()
    if not content:
        content = (msg.get("reasoning") or "").strip()
    return content


def _call_ollama(messages: list[dict[str, str]]) -> str:
    response = requests.post(
        f"{OLLAMA_HOST}/api/chat",
        json={
            "model": OLLAMA_MODEL,
            "messages": messages,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.1},
        },
        timeout=120,
        verify=certifi.where(),
    )
    response.raise_for_status()
    body = response.json()
    return (body.get("message") or {}).get("content") or ""


def _call_nim(messages: list[dict[str, str]]) -> str:
    response = requests.post(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {NVIDIA_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": NIM_MODEL,
            "messages": messages,
            "temperature": 0.1,
            "max_tokens": 1024,
            "response_format": {"type": "json_object"},
        },
        timeout=120,
        verify=certifi.where(),
    )
    response.raise_for_status()
    body = response.json()
    return (body.get("choices", [{}])[0].get("message") or {}).get("content") or ""


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

    if name == "get_snp_profile":
        args.setdefault("patient_id", patient.get("patient_id"))
    elif name in ("fetch_whoop", "fetch_glucose"):
        args.setdefault("patient_id", patient.get("patient_id"))
    elif name == "fetch_clinvar":
        if not args.get("rsids"):
            args["rsids"] = list(snp_profile.keys())
    elif name == "fetch_pharmgkb":
        if not args.get("genes"):
            args["genes"] = sorted(
                {
                    snp.get("gene")
                    for snp in snp_profile.values()
                    if isinstance(snp, dict) and snp.get("gene")
                }
            )
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
    return args


# ──────────────────────────────────────────────────────────────────────────────
# Deterministic fallback — keeps verification useful even with no LLM
# ──────────────────────────────────────────────────────────────────────────────


DETERMINISTIC_PLAN = [
    "get_snp_profile",
    "fetch_clinvar",
    "fetch_pharmgkb",
    "fetch_whoop",
    "fetch_glucose",
    "fetch_rxnorm",
    "fetch_pubmed",
    "fetch_trials",
    "check_safety_flags",
    "generate_brief",
]


def _deterministic_plan(
    patient_id: str,
    patient: dict[str, Any],
    tools_by_name: dict[str, dict[str, Any]],
    findings: dict[str, Any],
    trace: list[dict[str, Any]] | None = None,
    run_reason: str | None = None,
) -> dict[str, Any]:
    snp_profile = patient.get("snp_profile") or {}
    primary_rsids = ["rs7903146", "rs622342", "rs4149056", "rs4244285", "rs9939609"]
    primary_genes = ["TCF7L2", "SLC22A1", "SLCO1B1", "CYP2C19", "FTO"]
    pubmed_pairs = [
        ("TCF7L2", "metformin"),
        ("TCF7L2", "semaglutide"),
        ("SLCO1B1", "atorvastatin"),
        ("CYP2C19", "clopidogrel"),
    ]

    first_fallback_note = True

    def _note(tool_name: str, args: dict, result: Any) -> None:
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
        )
        rec["step"] = len(trace) + 1
        trace.append(rec)

    for tool_name in DETERMINISTIC_PLAN:
        if tool_name == "fetch_pubmed":
            collected: list[dict] = []
            last_meta: dict[str, Any] = {}
            for gene, drug in pubmed_pairs:
                args = {"gene": gene, "drug": drug}
                got = _execute_tool("fetch_pubmed", args, tools_by_name)
                if isinstance(got, dict):
                    collected.extend(got.get("articles") or [])
                    last_meta = got.get("_meta") or last_meta
                elif isinstance(got, list):
                    collected.extend(got)
                _note("fetch_pubmed", args, got)
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
                got = _execute_tool("fetch_trials", args, tools_by_name)
                _note("fetch_trials", args, got)
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
        elif tool_name == "fetch_pharmgkb":
            args = {"genes": primary_genes}
        else:
            args = {}

        args = _enrich_args(tool_name, args, findings, patient)
        result = _execute_tool(tool_name, args, tools_by_name)
        findings[tool_name] = result
        _note(tool_name, args, result)
        if tool_name == "generate_brief":
            return result

    return findings.get("generate_brief") or {}


# ──────────────────────────────────────────────────────────────────────────────
# Trace helpers
# ──────────────────────────────────────────────────────────────────────────────


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
    if error:
        brief["_backend_error"] = error
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
