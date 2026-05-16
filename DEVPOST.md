# GIRA — Devpost / submission copy (Hack-a-Claw · Nemotron)

## Elevator pitch (lead with the agent, not the dashboard)

**GIRA (Genomic Inference Rx Agent)** is an **autonomous clinical pharmacogenomics agent** for Type 2 diabetes—not a static report. Given a patient genome, structured clinician intake, and wearable/CGM context, **NVIDIA Nemotron** runs a **ReAct-style loop**: it issues JSON `tool_call` turns, executes live tools (ClinVar, PubMed, CPIC, ClinicalTrials.gov, RxNorm, safety gates), observes results, and assembles an evidence-linked clinician brief. A **second Nemotron pass** (`PGX_SYNTHESIS`) rewrites SNP-level findings and citation inferences **only from retrieved evidence**, not from pasted static text.

## What judges should look for in the demo

1. **GIRA thinking / agent trace** — each step shows **why** the tool ran (`reason`), plus a lightweight **agent role** tag (orchestrator · safety · evidence · writer).
2. **PT-003** — critical **SLCO1B1** / **CYP2C19** safety narrative, **CPIC** rows, and **PubMed-backed citations**.
3. **Brief header** — **Powered by NVIDIA Nemotron** when the brief was produced via NIM, OpenRouter, or Ollama; model id in `_llm_model`.
4. Run with **`refresh=true`** (or clear cache) so the trace is visible end-to-end.

## Suggested models (sponsor-aligned)

| Channel | Example model id |
|--------|-------------------|
| NVIDIA NIM | `nvidia/llama-3.3-nemotron-super-49b-v1.5` (`NIM_MODEL`) |
| OpenRouter | `nvidia/nemotron-3-super-120b-a12b:free` (`OPENROUTER_MODEL` / `OPENROUTER_AGENT_MODEL`) |

If Super is rate-limited during judging, set **`OPENROUTER_AGENT_MODEL`** to a smaller Nemotron slug from the sponsor list (nano / v2 variants as published on OpenRouter).

## Environment (judging night)

See `.env.example`. Minimum:

- `AGENT_MODE=llm`
- `PGX_SYNTHESIS=1`
- `NVIDIA_API_KEY` *or* `OPENROUTER_API_KEY`
- `NCBI_EMAIL` (+ `NCBI_API_KEY` recommended for PubMed/ClinVar throughput)

Quick CLI demo:

```bash
bash scripts/demo_hackathon.sh
```

## What not to claim (accurate positioning)

- **Not** built on OpenClaw / NemoClaw SDK — GIRA uses a **custom JSON tool contract** in `reasoning/nemotron.py`, compatible with Nemotron on NIM or OpenRouter.
- **Not** native OpenAI/Anthropic server-side function calling — tools are **parsed from model JSON** in the chat transcript.
- **`AGENT_MODE=parallel`** is a **deterministic high-throughput path**; Nemotron is optional there unless `PGX_SYNTHESIS=1` (then the writer pass may still call the LLM during `generate_brief`).

## 30–60s video storyboard

Split screen: **left** — GIRA agent console (trace steps appearing); **right** — clinician brief scrolling **Safety → CPIC → Recommendations → Citations**. Voiceover in one sentence: *“Nemotron plans and acts; GIRA never skips the safety gate.”*
