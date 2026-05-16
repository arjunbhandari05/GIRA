"""Nemotron reasoning via OpenRouter."""

import os
from pathlib import Path

import aiohttp
from dotenv import load_dotenv

from reasoning.prompts import build_system_prompt

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=True)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "nvidia/nemotron-3-super-120b-a12b:free"
ERROR_TEXT = "Reasoning unavailable — check OPENROUTER_API_KEY"


async def run_nemotron(context_prompt: str) -> str:
    key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not key:
        return ERROR_TEXT

    payload = {
        "model": MODEL,
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
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(OPENROUTER_URL, headers=headers, json=payload) as resp:
                if resp.status >= 400:
                    return ERROR_TEXT
                data = await resp.json()
        content = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
        if not content:
            return ERROR_TEXT
        if _looks_like_planning_text(content):
            return _final_brief_draft_from_context(context_prompt) or content
        return content
    except Exception:
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
